/* global __dirname, require, module */

const webpack = require('webpack');
const path = require('path');
const env = require('yargs').argv.env; // use --env with webpack 2

const UglifyJsPlugin = webpack.optimize.UglifyJsPlugin;

const libraryName = 'node-cba-netbank';

const plugins = [];
let outputFile;

if (env === 'build') {
  plugins.push(new UglifyJsPlugin({ minimize: true }));
  outputFile = 'index.min.js';
} else {
  outputFile = 'index.js';
}

const config = {
  entry: `${__dirname}/src/index.js`,
  devtool: 'source-map',
  output: {
    path: `${__dirname}/lib`,
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  },
  module: {
    rules: [{
      test: /(\.jsx|\.js)$/,
      loader: 'babel-loader',
      exclude: /(node_modules|bower_components)/,
    },
    {
      test: /(\.jsx|\.js)$/,
      loader: 'eslint-loader',
      exclude: /node_modules/,
    },
    ],
  },
  resolve: {
    modules: [path.resolve('./src')],
    extensions: ['.json', '.js'],
  },
  plugins,
};

module.exports = config;
