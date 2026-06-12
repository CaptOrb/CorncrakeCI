{
  description = "CornCrakeCI Continuous Integration system";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-26.05";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages."${system}";
      lib = pkgs.lib;

      server = pkgs.stdenv.mkDerivation {
        pname = "corncrakeci-server";
        version = "0.0.0";

        src = lib.cleanSource ./server;

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (pkgs.stdenv) system;
          src = lib.cleanSource ./server;
          pname = "corncrakeci-server";
          version = "0.0.0";
          hash = "sha256-pq0ZHFhtGdlx6HsQytYTIKOsSpSkt2KInueE3m/Fgcc=";


          # https://nixos.org/manual/nixpkgs/stable/#javascript-pnpm-fetcherVersion
          fetcherVersion = 3;
        };

        nativeBuildInputs = with pkgs; [
          nodejs
          pnpm
          pnpmConfigHook
          makeWrapper
        ];

        buildInputs = with pkgs; [
          stdenv.cc.cc
        ];

        buildPhase = ''
          runHook preBuild
          pnpm run generate:api

          pnpm run check

          # TODO produces output that won't run on Node :((
          #pnpm build

          # For now: bundle with esbuild
          ${pkgs.esbuild}/bin/esbuild src/index.ts \
            --bundle \
            --platform=node \
            --format=esm \
            --outfile=dist/index.js \
            --packages=external \
            --sourcemap

          # Remove non-prod dependencies
          pnpm prune --prod

          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          mkdir -p $out/libexec/corncrakeci-server $out/bin
          cp -r dist -T $out/libexec/corncrakeci-server/dist
          cp -r migrations -T $out/libexec/migrations
          cp -r node_modules -T $out/libexec/corncrakeci-server/node_modules

          # stops graphile-worker from hitting EACCES at the root
          # due to cosmiconfig search behaviour
          # https://github.com/graphile/worker/issues/571
          echo "{}" > $out/libexec/corncrakeci-server/.graphile-workerrc

          makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/corncrakeci-server \
            --add-flags "$out/libexec/corncrakeci-server/dist/index.js" \
            --chdir "$out/libexec/corncrakeci-server"

          runHook postInstall
        '';
      };
    in {
      packages = {
        inherit server;
        default = server;
      };

      apps =
        let
          serverApp = utils.lib.mkApp {
            drv = server;
          };
        in
        {
          server = serverApp;
          default = serverApp;
        };
    }) // (let
      forAllNixosSystems = nixpkgs.lib.genAttrs ["x86_64-linux" "aarch64-linux"];
    in {
#       nixosModules.corncrakeci = import ./nixos_module.nix self;
    });
}
