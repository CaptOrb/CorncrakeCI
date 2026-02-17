{
  description = "MOLCI Continuous Integration system";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-25.11";
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = nixpkgs.legacyPackages."${system}";
      lib = pkgs.lib;

      server = pkgs.stdenv.mkDerivation {
        pname = "molci-server";
        version = "0.0.0";

        src = lib.cleanSource ./server;

        pnpmDeps = pkgs.pnpm.fetchDeps {
          inherit (pkgs.stdenv) system;
          src = lib.cleanSource ./server;
          pname = "molci-server";
          version = "0.0.0";
          hash = "sha256-mSJuadvDL8/Tf6IJG3i0Un+lWLUhO02elZtrpS1K2oY=";


          # https://nixos.org/manual/nixpkgs/stable/#javascript-pnpm-fetcherVersion
          fetcherVersion = 3;
        };

        nativeBuildInputs = with pkgs; [
          nodejs
          pnpm.configHook
          makeWrapper
        ];

        buildInputs = with pkgs; [
          stdenv.cc.cc
        ];

        buildPhase = ''
          runHook preBuild
          pnpm run generate

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
          mkdir -p $out/libexec/molci-server $out/bin
          cp -r dist -T $out/libexec/molci-server/dist
          cp -r migrations -T $out/libexec/migrations
          cp -r node_modules -T $out/libexec/molci-server/node_modules

          # stops graphile-worker from hitting EACCES at the root
          # due to cosmiconfig search behaviour
          # https://github.com/graphile/worker/issues/571
          echo "{}" > $out/libexec/molci-server/.graphile-workerrc

          makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/molci-server \
            --add-flags "$out/libexec/molci-server/dist/index.js" \
            --chdir "$out/libexec/molci-server"

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
#       nixosModules.molci = import ./nixos_module.nix self;
    });
}
