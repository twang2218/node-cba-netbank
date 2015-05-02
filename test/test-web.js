// Dependencies
var expect = require('chai').expect;
var web = require('../lib/web');
var nock = require('nock');

describe('web.js', function () {
	var google = {};

	//  create a simple parser to use
	function simpleParser(page, callback) {
		expect(page).to.equal('Hello from Google!');
		callback(null, page.split(' '));
	}

	//  create a simple callback to use
	function simpleCallback(error, words) {
		if (error) {
			throw error
		}
		expect(words).to.eql(['Hello', 'from', 'Google!']);
	}

	before(function () {
		nock.disableNetConnect();
	})

	describe('- get()', function () {
		it('should download google page, run parser, call back', function (done) {
			var google = nock('http://www.google.com')
				.get('/')
				.reply(200, 'Hello from Google!');

			web.get({
				url: 'http://www.google.com'
			}, simpleParser, function (error,
				words) {
				simpleCallback(error, words);
				google.done();
				done();
			});
		});
	});

	describe('- post()', function () {
		it('should post a form, parse the page, and call back', function (done) {
			var google = nock('http://www.google.com.au')
				.post('/users', function (body) {
					expect(body.username).to.equal('johndoe');
					expect(body.password).to.equal('123456');

					return (body.username === 'johndoe' && body.password === '123456');
				}).reply(200, "Hello from Google!");

			web.post({
				url: 'http://www.google.com.au/users',
				form: {
					username: 'johndoe',
					password: '123456'
				}
			}, simpleParser, function (error, words) {
				simpleCallback(error, words);
				google.done();
				done();
			});
		});
	});

	after(function () {
		nock.restore();
		nock.cleanAll();
		nock.enableNetConnect();
	});
});
