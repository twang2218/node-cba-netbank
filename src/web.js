// Dependencies
const debug = require('debug')('node-cba-netbank');
const fs = require('mz/fs');
const isString = require('lodash/isString');
const request = require('request-promise');
const truncate = require('lodash/truncate');

// Initialisation
const DEFAULT_OPTION = {
  jar: true,
  followAllRedirects: true,
  resolveWithFullResponse: true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
    'Cache-Control': 'no-cache',
  },
};

// Utilities
function shorten(form) {
  const shortenForm = {};
  Object.keys(form).forEach((key) => {
    shortenForm[key] = truncate(form[key], { length: 200 });
  });
  return shortenForm;
}

function doRequest(req, params = {}) {
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
    fs.writeFile(`log/${sequence}-1-request.json`, JSON.stringify(shorten(myParams), null, 2));
  }

  return req(myParams).then((response) => {
    if (debug.enabled) {
      fs.writeFile(
        `log/${sequence}-2-response.json`,
        JSON.stringify(
          {
            request: response.request,
            status: {
              code: response.statusCode,
              message: response.statusMessage,
            },
            headers: response.headers,
            body: `${response.body.substring(0, 1000)}...`,
          },
          null,
          2,
        ),
      );
      fs.writeFile(`log/${sequence}-3-response-body.html`, response.body);
    }
    return { url: response.request.href, headers: response.headers, body: response.body };
  });
}

class WebClient {
  constructor() {
    this.request = request.defaults(DEFAULT_OPTION);
  }
  get(params) {
    return isString(params) ? doRequest(this.request, { url: params }) : doRequest(this.request, params);
  }
  post(params) {
    return doRequest(this.request, Object.assign({ method: 'POST' }, params));
  }
}

//  Export
module.exports = WebClient;
