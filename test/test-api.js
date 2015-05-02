// Dependencies
var expect = require('chai').expect;
var nock = require('nock');
var api = require('../lib/api');

// Test Credential
var credential = require('./auth');

describe('api.js', function () {
	var credential = {};
	var accountList;
	this.timeout(20000);

	before(function () {
		credential = require('./auth');
		//	Real world testing
		nock.enableNetConnect();
	});

	describe('- login()', function () {
		it('should login', function (done) {
			api.login(credential, function (error, accounts) {
				expect(error).to.be.null;
				expect(accounts).not.to.be.null;
				expect(accounts.length).to.be.above(0);
				accountList = accounts;

				done();
			});
		});
	});

	describe('- getTransactions()', function () {
		it('should retrieve transactions for given account', function (done) {
			this.timeout(600000);
			api.getTransactions(accountList[4], function (error, transactions) {
				expect(error).to.be.null;
				expect(transactions).not.to.be.null;
				expect(transactions.length).to.be.above(1000);

				done();
			});
		});
	});

});
