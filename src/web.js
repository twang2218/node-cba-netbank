// Dependencies
const request = require('request-promise');
const fs = require('fs');
const debug = require('debug')('node-cba-netbank');

// Initialisation
const DEFAULT_OPTION = {
  jar: true,
  followAllRedirects: true,
  resolveWithFullResponse: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
  },
};

// Utilities
const myRequest = request.defaults(DEFAULT_OPTION);
const isString = obj => typeof obj === 'string' || obj instanceof String;

function logToFile(filename, extension, content) {
  const name = `${filename}-${new Date().getTime()}${extension}`;
  fs.writeFile(`log/${name}`, content, (err) => {
    if (err) {
      debug(err);
    }
    debug(`Wrote file 'log/${name}'.`);
  });
}

function req(params = {}) {
  const { partial } = params;
  const headers = Object.assign({}, params.headers);
  if (partial) {
    headers['X-MicrosoftAjax'] = 'Delta=true';
  }
  const myParams = Object.assign({ method: 'GET' }, params, { headers });

  if (debug.enabled) {
    debug(JSON.stringify(myParams));
    if (myParams.form) {
      logToFile('form', '.json', JSON.stringify(myParams.form, null, 2));
    }
  }

  return myRequest(myParams).then((response) => {
    if (debug.enabled) {
      logToFile('response', '.json', JSON.stringify(response.request, null, 2));
      logToFile('body', '.html', response.body);
    }
    return { url: response.request.href, body: response.body };
  });
}

//  Export
module.exports = {
  get: params => (isString(params) ? req({ url: params }) : req(params)),
  post: params => req(Object.assign({ method: 'POST' }, params)),
};
