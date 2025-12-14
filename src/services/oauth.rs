use oauth2::{
    AuthorizationCode, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge, RedirectUrl,
    Scope, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthState {
    pub forge_id: i32,
    pub pkce_verifier: String,
    pub state: String,
}

pub struct OAuthClient {
    client_id: String,
    client_secret: String,
    auth_url: String,
    token_url: String,
    redirect_url: String,
}

impl OAuthClient {
    pub fn new(
        client_id: String,
        client_secret: String,
        auth_url: String,
        token_url: String,
        redirect_url: String,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            auth_url,
            token_url,
            redirect_url,
        }
    }

    pub fn get_auth_url(&self, forge_id: i32) -> Result<(String, OAuthState), Box<dyn std::error::Error>> {
        let client = oauth2::basic::BasicClient::new(
            ClientId::new(self.client_id.clone()),
            Some(ClientSecret::new(self.client_secret.clone())),
            AuthUrl::new(self.auth_url.clone())?,
            Some(TokenUrl::new(self.token_url.clone())?),
        )
        .set_redirect_uri(RedirectUrl::new(self.redirect_url.clone())?);

        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
        let state = CsrfToken::new_random();

        let (auth_url, _) = client
            .authorize_url(|| state.clone())
            .add_scope(Scope::new("read:user".to_string()))
            .add_scope(Scope::new("read:repository".to_string()))
            .set_pkce_challenge(pkce_challenge)
            .url();

        Ok((
            auth_url.to_string(),
            OAuthState {
                forge_id,
                pkce_verifier: pkce_verifier.secret().to_string(),
                state: state.secret().to_string(),
            },
        ))
    }

    pub async fn exchange_code(
        &self,
        code: String,
        state: String,
        stored_state: &OAuthState,
    ) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
        if state != stored_state.state {
            return Err("Invalid state parameter".into());
        }

        let client = oauth2::basic::BasicClient::new(
            ClientId::new(self.client_id.clone()),
            Some(ClientSecret::new(self.client_secret.clone())),
            AuthUrl::new(self.auth_url.clone())?,
            Some(TokenUrl::new(self.token_url.clone())?),
        )
        .set_redirect_uri(RedirectUrl::new(self.redirect_url.clone())?);

        let pkce_verifier = oauth2::PkceCodeVerifier::new(stored_state.pkce_verifier.clone());
        let token_result = client
            .exchange_code(AuthorizationCode::new(code))
            .set_pkce_verifier(pkce_verifier)
            .request_async(oauth2::reqwest::async_http_client)
            .await?;

        let mut token_data = HashMap::new();
        token_data.insert("access_token".to_string(), token_result.access_token().secret().to_string());
        
        if let Some(refresh_token) = token_result.refresh_token() {
            token_data.insert("refresh_token".to_string(), refresh_token.secret().to_string());
        }

        Ok(token_data)
    }
}