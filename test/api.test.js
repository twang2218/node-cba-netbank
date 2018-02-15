/* eslint-disable no-undef */

// Dependencies
const nock = require('nock');
const path = require('path');
const API = require('../src/api');
const debug = require('debug')('node-cba-netbank');

// jasmine.DEFAULT_TIMEOUT_INTERVAL = 600000;

const getFilePath = file => path.resolve(path.resolve(__dirname, 'test_cases'), file);

const pages = {
  //  logon page
  logon: getFilePath('01-logon-page.html'),
  //  account list page
  home: getFilePath('02-home-page.html'),
  //  history page
  history: getFilePath('03-history-page.html'),
  //  history page
  historyPartial: getFilePath('04-history-partial.txt'),
  //  final empty history page
  historyEmpty: getFilePath('05-history-empty.txt'),
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
      //  Logon page
      .get('/netbank/Logon/Logon.aspx')
      .replyWithFile(200, pages.logon)
      //  Logon page: submit logon form with right credential
      .post('/netbank/Logon/Logon.aspx', (body) => {
        if (body.txtMyClientNumber$field === credential.username && body.txtMyPassword$field === credential.password) {
          isLoggedIn = true;
          return true;
        }
        isLoggedIn = false;
        return false;
      })
      .replyWithFile(200, pages.home)
      //  Logon page: submit logon form with wrong credential
      .post('/netbank/Logon/Logon.aspx')
      .replyWithFile(200, pages.logon)
      //  retrieve transaction page (logged in)
      .get('/netbank/TransactionHistory/History.aspx')
      .replyWithFile(200, pages.history)
      //  Post to search transaction
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.history)
      //  get more transaction
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.historyPartial)
      //  get more transaction (but no more transactions)
      .post('/netbank/TransactionHistory/History.aspx', () => isLoggedIn)
      .replyWithFile(200, pages.historyEmpty)
  );
}

describe('api.js', () => {
  //  start the real world testing if there is a credential file.
  if (process.env.NETBANK_USERNAME && process.env.NETBANK_PASSWORD) {
    // this.timeout(20000);

    beforeAll(() => {
      /* eslint-disable global-require,import/no-unresolved */
      //  Load test credential
      credential.username = process.env.NETBANK_USERNAME;
      credential.password = process.env.NETBANK_PASSWORD;
      //  Real world testing
      nock.enableNetConnect();
    });

    describe('- logon()', () => {
      it(
        'should be able to logon with correct credential',
        () => {
          expect.assertions(3);
          return expect(new API()
            .logon(credential.username, credential.password)
            .then((resp) => {
              expect(resp.accounts).toBeDefined();
              expect(resp.accounts.length).toBeGreaterThan(1);
              return resp;
            })
            .catch((err) => {
              debug(err);
              throw err;
            })).resolves.toBeDefined();
        },
        10000,
      );
      it(
        'should failed if credential is not working',
        () => {
          expect.assertions(1);
          return expect(new API().logon(credentialWrong.username, credentialWrong.password)).rejects.toBeDefined();
        },
        10000,
      );
    });

    describe('- getTransactionHistory()', () => {
      it(
        'should retrieve transactions for given account',
        () => {
          expect.assertions(5);
          const api = new API();
          return expect(api
            .logon(credential.username, credential.password)
            .then((resp) => {
              expect(resp.accounts).toBeDefined();
              expect(resp.accounts.length).toBeGreaterThan(0);
              return api.getTransactionHistory(resp.accounts[0]);
            })
            .then((resp) => {
              expect(resp.transactions).toBeDefined();
              expect(resp.transactions.length).toBeGreaterThan(400);
              return resp;
            })
            .catch((err) => {
              debug(err);
              throw err;
            })).resolves.toBeDefined();
        },
        120000,
      );
    });
  } else {
    // use nock to mock the website
    debug('Mocking website ...');
    describe('- logon()', () => {
      beforeEach(() => {
        mockWebsite();
        nock.disableNetConnect();
      });
      afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
      });

      it('should be able to logon with correct credential', () => {
        expect.assertions(3);
        return expect(new API()
          .logon(credential.username, credential.password)
          .then((resp) => {
            expect(resp.accounts).toBeDefined();
            expect(resp.accounts.length).toBeGreaterThan(1);
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          })).resolves.toBeDefined();
      });
      it('should failed if credential is not working', () => {
        expect.assertions(1);
        return expect(new API().logon(credentialWrong.username, credentialWrong.password)).rejects.toBeDefined();
      });
    });

    describe('- getTransactionHistory()', () => {
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
        const api = new API();
        return expect(api
          .logon(credential.username, credential.password)
          .then((resp) => {
            expect(resp.accounts).toBeDefined();
            expect(resp.accounts.length).toEqual(4);
            return api.getTransactionHistory(resp.accounts[0]);
          })
          .then((resp) => {
            expect(resp.transactions).toBeDefined();
            expect(resp.transactions.length).toEqual(99);
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          })).resolves.toBeDefined();
      });
      it('should failed if error happend during the transactions page parsing', () => {
        expect.assertions(1);
        return expect(new API().logon(credentialWrong.username, credentialWrong.password)).rejects.toBeDefined();
      });
    });
  }
});
