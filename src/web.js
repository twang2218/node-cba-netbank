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

function writeToFile(filename, content) {
  fs.writeFile(`log/${filename}`, content, (err) => {
    if (err) {
      debug(err);
    }
    debug(`Wrote to file => 'log/${filename}'.`);
  });
}

function shorten(form) {
  const MAX_LEN = 200;
  const shortenForm = {};
  Object.entries(form).forEach((entry) => {
    if (entry[1].length > MAX_LEN) {
      shortenForm[entry[0]] = `${entry[1].substring(0, MAX_LEN)}... (${entry[1].length - MAX_LEN} bytes more)`;
    } else {
      shortenForm[entry[0]] = entry[1];
    }
  });
  return shortenForm;
}

function req(params = {}) {
  const sequence = Date.now();
  const { partial } = params;
  const headers = Object.assign({}, params.headers);
  if (partial) {
    headers['X-MicrosoftAjax'] = 'Delta=true';
  }
  const myParams = Object.assign({ method: 'GET' }, params, { headers });

  if (debug.enabled) {
    debug(`${myParams.method} ${myParams.url.substring(0, 80)}...`);
    debug(`headers => ${JSON.stringify(shorten(myParams.headers))}`);
    if (myParams.method === 'POST') {
      debug(`form => ${JSON.stringify(shorten(myParams.form))}`);
    }
    writeToFile(`${sequence}-1-request.json`, JSON.stringify(shorten(myParams), null, 2));
  }

  return myRequest(myParams).then((response) => {
    if (debug.enabled) {
      writeToFile(`${sequence}-2-response.json`, JSON.stringify({
        request: response.request,
        status: {
          code: response.statusCode,
          message: response.statusMessage,
        },
        headers: response.headers,
        body: `${response.body.substring(0, 1000)}...`,
      }, null, 2));
      writeToFile(`${sequence}-3-response-body.html`, response.body);
    }
    return { url: response.request.href, headers: response.headers, body: response.body };
  });
}

//  Export
module.exports = {
  get: params => (isString(params) ? req({ url: params }) : req(params)),
  post: params => req(Object.assign({ method: 'POST' }, params)),
};
