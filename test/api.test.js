/* eslint-disable no-undef */

// Dependencies
const nock = require('nock');
const fs = require('fs');
const path = require('path');
const api = require('../src/api');
const debug = require('debug')('node-cba-netbank');

// jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

const getFilePath = file =>
  path.resolve(path.resolve(__dirname, 'test_cases'), file);

const pages = {
  //  login page
  login: getFilePath('01-login-page.html'),
  //  account list page
  homePage: getFilePath('02-home-page.html'),
  //  transactions page
  transactionList: getFilePath('03-transaction-page.html'),
  //  transactions page
  transactionPartial: getFilePath('04-transaction-partial.txt'),
  //  final empty transactions page
  transactionEmpty: getFilePath('05-transaction-empty.txt'),
  //  transaction json - case 1
  transactionJson1: getFilePath('transaction-1.json'),
  //  transaction json - case 2
  transactionJson2: getFilePath('transaction-2.json'),
  //  transaction json - case 3
  transactionJson3: getFilePath('transaction-3.json'),
};

const credential = { username: '76543210', password: 'YourPassword' };
const credentialWrong = { username: '23423423', password: 'WrongPassword' };

let isLoggedIn = false;

function mockWebsite() {
  return (
    nock('https://www.my.commbank.com.au')
      //  Remove the query string
      .filteringPath(/\?.*$/g, '')
      //  Login page
      .get('/netbank/Logon/Logon.aspx')
      .replyWithFile(200, pages.login)
      //  Login page: submit login form with right credential
      .post('/netbank/Logon/Logon.aspx', (body) => {
        if (
          body.txtMyClientNumber$field === credential.username &&
          body.txtMyPassword$field === credential.password
        ) {
          isLoggedIn = true;
          return true;
        }
        isLoggedIn = false;
        return false;
      })
      .replyWithFile(200, pages.homePage)
      //  Login page: submit login form with wrong credential
      .post('/netbank/Logon/Logon.aspx')
      .replyWithFile(200, pages.login)
      //  retrieve transaction page (logged in)
      .get('/netbank/TransactionHistory/History.aspx')
      .replyWithFile(200, pages.transactionList)
      //  Post to search transaction
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.transactionList)
      //  get more transaction
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.transactionPartial)
      //  get more transaction (but no more transactions)
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.transactionEmpty)
  );
}

describe('api.js', () => {
  //  start the real world testing if there is a credential file.
  if (fs.existsSync(`${__dirname}/auth.json`)) {
    // this.timeout(20000);

    beforeAll(() => {
      /* eslint-disable global-require,import/no-unresolved */
      //  Load test credential
      const auth = require('./auth');
      credential.username = auth.username;
      credential.password = auth.password;
      //  Real world testing
      nock.enableNetConnect();
    });

    describe('- login()', () => {
      it('should be able to login with correct credential', () => {
        expect.assertions(3);
        return expect(
          api.login(credential).then((resp) => {
            expect(resp.accounts).toBeDefined();
            expect(resp.accounts.length).toBeGreaterThan(1);
            return resp;
          }),
        ).resolves.toBeDefined();
      }, 10000);
      it('should failed if credential is not working', () => {
        expect.assertions(1);
        return expect(api.login(credentialWrong)).rejects.toBeDefined();
      }, 10000);
    });

    describe('- getTransactions()', () => {
      it('should retrieve transactions for given account', () => {
        expect.assertions(5);
        return expect(
          api
            .login(credential)
            .then((resp) => {
              expect(resp.accounts).toBeDefined();
              expect(resp.accounts.length).toBeGreaterThan(0);
              return api.getTransactions(resp.accounts[0]);
            })
            .then((resp) => {
              expect(resp.transactions).toBeDefined();
              expect(resp.transactions.length).toBeGreaterThan(400);
              return resp;
            }),
        ).resolves.toBeDefined();
      }, 120000);
    });
  } else {
    // use nock to mock the website
    debug('Mocking website ...');
    describe('- login()', () => {
      beforeEach(() => {
        mockWebsite();
        nock.disableNetConnect();
      });
      afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
      });

      it('should be able to login with correct credential', () => {
        expect.assertions(3);
        return expect(
          api.login(credential).then((resp) => {
            expect(resp.accounts).toBeDefined();
            expect(resp.accounts.length).toBeGreaterThan(1);
            return resp;
          }),
        ).resolves.toBeDefined();
      });
      it('should failed if credential is not working', () => {
        expect.assertions(1);
        return expect(api.login(credentialWrong)).rejects.toBeDefined();
      });
    });

    describe('- getTransactions()', () => {
      beforeEach(() => {
        mockWebsite();
        nock.disableNetConnect();
      });
      afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
      });

      it('should retrieve transactions for given account', () => {
        expect.assertions(5);
        return expect(
          api
            .login(credential)
            .then((resp) => {
              expect(resp.accounts).toBeDefined();
              expect(resp.accounts.length).toEqual(4);
              return api.getTransactions(resp.accounts[0]);
            })
            .then((resp) => {
              expect(resp.transactions).toBeDefined();
              expect(resp.transactions.length).toEqual(99);

              return resp;
            }),
        ).resolves.toBeDefined();
      });
      it('should failed if error happend during the transactions page parsing', () => {
        expect.assertions(1);
        return expect(api.login(credentialWrong)).rejects.toBeDefined();
      });
    });
  }
});
