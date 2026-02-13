const path = require("path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const { assetExts } = defaultConfig.resolver;

const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
  resolver: {
    assetExts: [...assetExts, "css"],
    blockList: [/node_modules\/.*\/android\/\.cxx\/.*/],
    resolveRequest: (context, moduleName, platform) => {
      // react-native-svg 15.x usa src/ que falha no Metro; forçar uso do build compilado
      if (moduleName === "react-native-svg") {
        const resolved = path.resolve(
          __dirname,
          "node_modules/react-native-svg/lib/commonjs/index.js"
        );
        return { filePath: resolved, type: "sourceFile" };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
