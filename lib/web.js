// Dependencies
var request = require('request');
var url = require('url');

// Constructor
var web = module.exports = {};

// Initialisation
request = request.defaults({
	jar: true,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36'
	},
	followAllRedirects: true
});

var UrlBase = 'https://www.my.commbank.com.au';

function parseParams(params) {
	var p = {};
	p.url = url.resolve(UrlBase, params.url);
	p.form = params.form;
	if (params.redirect !== false) {
		p.followAllRedirects = true;
	}
	if (params.partial === true) {
		p.headers = {
			'X-MicrosoftAjax': 'Delta=true'
		};
	}
	return p;
}

web.get = function (params, parser, callback) {
	var p = parseParams(params);
	request(p, function (error, response, body) {
		if (!error && response.statusCode === 200) {
			var link = url.parse(UrlBase);
			if (link.hostname !== response.request.host) {
				//	redirected to another server, so update 'UrlBase' to the new one
				link.host = response.request.host;
				UrlBase = url.format(link);
			}
			parser(body, callback);
		} else {
			callback(error);
		}
	});
};

// params:
// {
// 	url,
// 	form,
// 	redirect, //	default: true
// 	partial   //	default: false
// }

web.post = function (params, parser, callback) {
	var p = parseParams(params);
	request.post(p, function (error, response, body) {
		if (error === null && response.statusCode === 200) {
			parser(body, callback);
		} else {
			console.log(error);
			if (typeof response !== 'undefined') {
				console.log('Response code: [' + response.statusCode + ']');
				if (response.statusCode === 302) {
					console.log(body);
				}
			}
			callback(error);
		}
	});
};
