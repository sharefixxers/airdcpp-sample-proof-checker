// Bundles src/main.js AND its npm dependencies (airdcpp-extension-settings)
// into a single, fully self-contained dist/main.js. This matters because
// The client only ever copies that one file (plus package.json/README.md) into
// its extensions folder -- there is no node_modules folder alongside it at
// runtime, so anything not bundled in here would fail to load.
//
// Only genuine Node.js built-ins (fs, path, ...) are left as real require()
// calls, since those always exist wherever Node itself runs.
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'main.js',
    libraryTarget: 'commonjs2',
  },
  // "node" preset externalizes Node's own built-in modules (fs, path, etc.)
  // automatically -- but NOT npm dependencies like airdcpp-extension-settings,
  // which is exactly what we want: those get bundled in below.
  externalsPresets: { node: true },
};
