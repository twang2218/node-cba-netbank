// Dependencies
var request = require('request');
var url = require('url');
var fs = require('fs');

// Constructor
var web = module.exports = {};

var debug = false;

// Initialisation
request = request.defaults({
	jar: true,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36'
	},
	followAllRedirects: true
});

function parseParams(method, params) {
	var p = {};
	p.url = params.url;
	p.form = params.form;
	if (params.redirect !== false) {
		p.followAllRedirects = true;
	}
	if (params.partial === true) {
		p.headers = {
			'X-MicrosoftAjax': 'Delta=true'
		};
	}
	p.method = method;
	return p;
}

function writeFile(filename, extension, content) {
	if (debug) {
		var name = filename + '-' + (new Date().getTime()) + extension;
		fs.writeFile('temp/' + name, content, function (err) {
			if (err === null) {
				console.log('Wrote file \'' + name + '\'.');
			}
		});
	}
}

// params:
// {
// 	url,
// 	form,
// 	redirect, //	default: true
// 	partial   //	default: false
// }

function req(params, parser, callback) {
	if (debug) {
		console.log(params.method + ': ' + params.url);
		if (params.form !== null && typeof params.form !== 'undefined') {
			writeFile('form', '.json', JSON.stringify(params.form, null, 2))
		}
	}

	request(params, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			writeFile('response', '.json', JSON.stringify(response.request, null, 2));
			writeFile('body', '.html', body);

			parser(response.request.href, body, callback);
		} else {
			callback(error);
		}
	});
}

web.get = function (params, parser, callback) {
	var p = parseParams('GET', params);
	req(p, parser, callback);
};

web.post = function (params, parser, callback) {
	var p = parseParams('POST', params);
	req(p, parser, callback);
};
