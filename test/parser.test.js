/* eslint-disable no-undef */

// Dependencies
const parser = require('../src/parser');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

function load(filename) {
  return fs.readFileSync(path.resolve(path.resolve(__dirname, 'test_cases'), filename)).toString();
}

const pages = {
  //  login page
  login: load('01-login-page.html'),
  //  account list page
  homePage: load('02-home-page.html'),
  //  transactions page
  transactionList: load('03-transaction-page.html'),
  //  partial transactions page
  transactionPartial: load('04-transaction-partial.txt'),
  //  transaction json - case 1
  transactionJson1: load('transaction-1.json'),
  //  transaction json - case 2
  transactionJson2: load('transaction-2.json'),
  //  transaction json - case 3
  transactionJson3: load('transaction-3.json'),
};

const links = {
  login: 'https://www.my.commbank.com.au/netbank/Logon/Logon.aspx',
  home: '/netbank/Portfolio/Home/Home.aspx',
  history: 'https://www.my.commbank.com.au/netbank/TransactionHistory/History.aspx',
};

describe('parser.js', () => {
  describe('- parseForm()', () => {
    function parseForm(body = pages.transactionList) {
      return parser.parseForm({ url: links.login, body })
        .then((resp) => {
          expect(resp.url).toEqual(links.login);
          return resp;
        });
    }

    test('should be able parse the properties', () => {
      expect.assertions(10);
      return expect(parseForm(pages.login)
        .then((resp) => {
          expect(resp.form).toHaveProperty('RID');
          expect(resp.form).toHaveProperty('SID');
          expect(resp.form).toHaveProperty('cid');
          expect(resp.form).toHaveProperty('rqid');
          expect(resp.form).toHaveProperty('__VIEWSTATE');
          expect(resp.form).toHaveProperty('txtMyClientNumber$field');
          expect(resp.form).toHaveProperty('txtMyPassword$field');
          expect(Object.keys(resp.form).length).toEqual(12);
          return resp;
        })).resolves.toBeDefined();
    });
    test('should parse the value of properties', () => {
      expect.assertions(5);
      return expect(parseForm(pages.login)
        .then((resp) => {
          expect(resp.form.RID).toEqual('TsFbWpAhjU6Q6Ub1pWwQEQ');
          expect(resp.form.btnLogon$field).toEqual('LOG ON');
          expect(resp.form.txtMyClientNumber$field).toEqual('');
          return resp;
        })).resolves.toBeDefined();
    });
    test('should parse <input type="radio" ...>', () => {
      expect.assertions(4);
      return expect(parseForm(pages.transactionList)
        .then((resp) => {
          expect(resp.form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$).toEqual(
            'AllTransactions');
          expect(resp.form.ctl00$BodyPlaceHolder$radioSwitchDateRange$field$).toEqual('TimePeriod');
          return resp;
        })).resolves.toBeDefined();
    });
    test('should parse <input type="checkbox" ...>', () => {
      expect.assertions(4);
      return expect(parseForm(pages.transactionList)
        .then((resp) => {
          expect(resp.form.ctl00$ContentHeaderPlaceHolder$chkTxnScrolling$field).toEqual('on');
          expect(resp.form.ctl00$ContentHeaderPlaceHolder$chkMergeCreditDebit$field).toEqual('on');
          return resp;
        })).resolves.toBeDefined();
    });
    test('should parse <select><option ...>...</select>', () => {
      expect.assertions(4);
      return expect(parseForm(pages.transactionList)
        .then((resp) => {
          expect(resp.form.ctl00$ContentHeaderPlaceHolder$ddlAccount$field)
            .toEqual('5218921743830977,MCD,True,True,True,False,True,False,True,False');
          expect(resp.form.ctl00$BodyPlaceHolder$ddlDateRange$field).toEqual('3');
          return resp;
        })).resolves.toBeDefined();
    });
    test('should raise error if there is no form in the page', () => {
      expect.assertions(1);
      return expect(parseForm(pages.transactionPartial)).rejects.toBeDefined();
    });
  });

  describe('- parseAccountList()', () => {
    test('should parse account list', () => {
      expect.assertions(27);
      return expect(
        parser.parseAccountList({ url: links.home, body: pages.homePage })
        .then((resp) => {
          expect(resp.url).toEqual(links.home);

          expect(resp.accounts.length).toEqual(4);

          expect(resp.accounts[0].nickname).toEqual('Smart Access');
          expect(resp.accounts[0].bsbNumber).toEqual('06 2338');
          expect(resp.accounts[0].accountNumber).toEqual('5282 0634');
          expect(resp.accounts[0].number).toEqual('06233852820634');
          expect(resp.accounts[0].balance).toEqual(23.45);
          expect(resp.accounts[0].availableFunds).toEqual(-23.45);

          expect(resp.accounts[1].nickname).toEqual('NetBank Saver');
          expect(resp.accounts[1].bsbNumber).toEqual('06 2438');
          expect(resp.accounts[1].accountNumber).toEqual('5287 0642');
          expect(resp.accounts[1].number).toEqual('06243852870642');
          expect(resp.accounts[1].balance).toEqual(1234.50);
          expect(resp.accounts[1].availableFunds).toEqual(234.50);

          expect(resp.accounts[2].nickname).toEqual('GoalSaver');
          expect(resp.accounts[2].bsbNumber).toEqual('06 2860');
          expect(resp.accounts[2].accountNumber).toEqual('1000 6652');
          expect(resp.accounts[2].number).toEqual('06286010006652');
          expect(resp.accounts[2].balance).toEqual(76543.00);
          expect(resp.accounts[2].availableFunds).toEqual(76043.00);

          expect(resp.accounts[3].nickname).toEqual('MasterCard Platinum');
          expect(resp.accounts[3].bsbNumber).toEqual('');
          expect(resp.accounts[3].accountNumber).toEqual('5218 9217 4383 0977');
          expect(resp.accounts[3].number).toEqual('5218921743830977');
          expect(resp.accounts[3].balance).toEqual(-123.45);
          expect(resp.accounts[3].availableFunds).toEqual(12345.67);

          return resp;
        })).resolves.toBeDefined();
    });

    test('should raise error if there is no account list in the page', () => {
      expect.assertions(1);
      return expect(parser.parseAccountList({ url: links.login, body: pages.login }))
        .rejects.toBeDefined();
    });
  });

  describe('- parseHomePage()', () => {
    test('should parse the submit form and account list', () => {
      expect.assertions(6);
      return expect(parser.parseHomePage({ url: links.home, body: pages.homePage })
        .then((resp) => {
          expect(resp.url).toEqual(links.home);

          expect(resp.form).toHaveProperty('RID');
          expect(resp.form).toHaveProperty('SID');
          expect(resp.form).toHaveProperty('__EVENTVALIDATION');
          expect(resp.accounts.length).toEqual(4);

          return resp;
        })).resolves.toBeDefined();
    });
    test('should raise error if fail to parse the account list in the home page.', () => {
      expect.assertions(1);
      return expect(parser.parseHomePage({ url: links.login, body: pages.login }))
        .rejects.toBeDefined();
    });
    test('should raise error if fail to parse the page at all', () => {
      expect.assertions(1);
      return expect(parser.parseHomePage({ url: links.login, body: pages.transactionPartial }))
        .rejects.toBeDefined();
    });
  });

  describe('- parseCurrency()', () => {
    const sampleCurrencies = [
      { text: '$12.34', number: 12.34 },
      { text: '12.34', number: 12.34 },
      { text: '$123,456.78', number: 123456.78 },
      { text: '$123,234.34 CR', number: 123234.34 },
      { text: '$1,234.56 DR', number: -1234.56 },
    ];

    sampleCurrencies.forEach((c) => {
      test(`should parse "${c.text}"`, () => {
        expect(parser.parseCurrency(c.text)).toEqual(c.number);
      });
    });
  });

  describe('- extractTransactionJsonArray()', () => {
    test('should extract transactions JSON array from html', () => {
      const json = parser.extractTransactionJsonArray(pages.transactionList);
      expect(json.length).toEqual(59);
      const t1 = json[0];
      expect(t1.Date.Text).toEqual('27 Apr 2015');
      expect(t1.Description.Text).toEqual('EWAY ELECTRONIC TOLL     HAMMONDVILLE');
      expect(t1.Amount.Text).toEqual('$100.75 DR');
      expect(t1.TranCode.Text).toEqual('00 05');
    });
    test('should parse transactions JSON array from partial callback', () => {
      const json = parser.extractTransactionJsonArray(pages.transactionPartial);
      expect(json.length).toEqual(40);
      const t1 = json[0];
      expect(t1.Date.Sort[1]).toEqual('201412050743384149731');
      expect(t1.Date.Text).toEqual('05 Dec 2014');
      expect(t1.Description.Text).toEqual('Transfer to xx1060 CommBank app');
      expect(t1.Amount.Text).toEqual('$30.00 DR');
      expect(t1.Balance.Text).toEqual('$25.68 CR');
      expect(t1.TranCode.Text).toEqual('550085');
      expect(t1.ReceiptNumber.Text).toEqual('N120548420145');
    });
    test('should return null if cannot parse the page', () => {
      const json = parser.extractTransactionJsonArray(pages.login);
      expect(json).toBeNull();
    });
  });

  describe('- parseJsonToTransaction()', () => {
    test('should parse JSON to Transaction object - case 1', () => {
      const json = JSON.parse(pages.transactionJson1);
      const t = parser.parseJsonToTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp).utc();
      expect(date.year()).toEqual(2014);
      expect(date.month()).toEqual(10);
      expect(date.date()).toEqual(30);
      expect(date.hours()).toEqual(20);
      expect(date.minutes()).toEqual(26);
      expect(date.seconds()).toEqual(19);
      expect(date.milliseconds()).toEqual(488);

      expect(t.description).toEqual('Credit Interest');
      expect(t.amount).toEqual(0.01);
      expect(t.balance).toEqual(5.68);
      expect(t.trancode).toEqual('700000');
      expect(t.receiptnumber).toEqual('');
    });
    test('should parse JSON to Transaction object - case 2', () => {
      const json = JSON.parse(pages.transactionJson2);
      const t = parser.parseJsonToTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp).utc();
      expect(date.year()).toEqual(2014);
      expect(date.month()).toEqual(10);
      expect(date.date()).toEqual(20);
      expect(date.hours()).toEqual(8);
      expect(date.minutes()).toEqual(16);
      expect(date.seconds()).toEqual(41);
      expect(date.milliseconds()).toEqual(306);

      expect(t.description).toEqual('Transfer to xx1060 CommBank app');
      expect(t.amount).toEqual(-100);
      expect(t.balance).toEqual(20.67);
      expect(t.trancode).toEqual('550085');
      expect(t.receiptnumber).toEqual('N112044272766');
    });
    test('should parse JSON to Transaction object - case 3', () => {
      const json = JSON.parse(pages.transactionJson3);
      const t = parser.parseJsonToTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp).utc();
      expect(date.year()).toEqual(2015);
      expect(date.month()).toEqual(3);
      expect(date.date()).toEqual(25);
      expect(date.hours()).toEqual(0);
      expect(date.minutes()).toEqual(0);
      expect(date.seconds()).toEqual(0);
      expect(date.milliseconds()).toEqual(3);

      expect(t.description).toEqual('DAMS APPLE AT THE STAT   HURSTVILLE');
      expect(t.amount).toEqual(-19.72);
      expect(t.balance).toEqual(0);
      expect(t.trancode).toEqual('00 05');
      expect(t.receiptnumber).toEqual('');
    });
    test('should return null rather than raise error if given json is not parsable', () => {
      const json = JSON.parse('{"it":"is not transaction"}');
      const t = parser.parseJsonToTransaction(json);
      expect(t).toBeNull();
    });
  });

  describe('- parseTransactions()', () => {
    test('should parse a page to transction object array', () => {
      expect.assertions(14);
      return expect(parser.parseTransactions({ url: links.history, body: pages.transactionList })
        .then((resp) => {
          expect(resp.url).toEqual(links.history);

          expect(resp.transactions.length).toEqual(59);
          expect(moment(resp.transactions[0].timestamp).utc().year()).toEqual(2015);
          expect(moment(resp.transactions[1].timestamp).utc().month()).toEqual(3);
          expect(moment(resp.transactions[2].timestamp).utc().date()).toEqual(25);
          expect(moment(resp.transactions[3].timestamp).utc().hours()).toEqual(0);
          expect(moment(resp.transactions[4].timestamp).utc().minutes()).toEqual(0);
          expect(moment(resp.transactions[5].timestamp).utc().seconds()).toEqual(0);
          expect(resp.transactions[6].description).toEqual('INTEREST CHARGES');
          expect(resp.transactions[7].amount).toEqual(-5.5);
          expect(resp.transactions[8].balance).toEqual(0);
          expect(resp.transactions[9].trancode).toEqual('00 05');
          expect(resp.transactions[10].receiptnumber).toEqual('');

          return resp;
        })).resolves.toBeDefined();
    });
    test('should parse a PARTIAL page to transction object array', () => {
      expect.assertions(14);
      return expect(parser.parseTransactions({ url: links.history, body: pages.transactionPartial })
        .then((resp) => {
          expect(resp.url).toEqual(links.history);

          expect(resp.transactions.length).toEqual(40);
          expect(moment(resp.transactions[0].timestamp).utc().year()).toEqual(2014);
          expect(moment(resp.transactions[1].timestamp).utc().month()).toEqual(11);
          expect(moment(resp.transactions[2].timestamp).utc().date()).toEqual(3);
          expect(moment(resp.transactions[3].timestamp).utc().hours()).toEqual(20);
          expect(moment(resp.transactions[4].timestamp).utc().minutes()).toEqual(52);
          expect(moment(resp.transactions[5].timestamp).utc().seconds()).toEqual(15);
          expect(resp.transactions[6].description).toEqual('Transfer to xx1060 CommBank app');
          expect(resp.transactions[7].amount).toEqual(-600);
          expect(resp.transactions[8].balance).toEqual(680.67);
          expect(resp.transactions[9].trancode).toEqual('550085');
          expect(resp.transactions[10].receiptnumber).toEqual('N112744391641');

          return resp;
        })).resolves.toBeDefined();
    });
    test('should raise error if it cannot parse the page', () => {
      expect.assertions(1);
      return expect(parser.parseTransactions({ url: links.login, body: pages.login }))
        .rejects.toBeDefined();
    });
  });

  describe('- parseAccountKeys()', () => {
    test('should parse account list with the key of form', () => {
      expect.assertions(7);
      return expect(parser.parseAccountKeys({ url: links.history, body: pages.transactionList })
        .then((resp) => {
          expect(resp.url).toEqual(links.history);

          expect(resp.accounts.length).toEqual(4);
          expect(resp.accounts[0].nickname).toEqual('Smart Access');
          expect(resp.accounts[1].number).toEqual('06243852870642');
          expect(resp.accounts[2].key).toEqual(
            '286010006652,DDA,True,False,False,True,True,False,True,False');
          expect(resp.accounts[3].key).toEqual(
            '5218921743830977,MCD,True,True,True,False,True,False,True,False');

          return resp;
        })).resolves.toBeDefined();
    });
    test('should raise error if there is no account list options in the page', () => {
      expect.assertions(1);
      return expect(parser.parseAccountKeys({ url: links.login, body: pages.login }))
        .rejects.toBeDefined();
    });
  });

  describe('- parseTransactionPage()', () => {
    test('should parse the transaction page and get form, transactions and keys', () => {
      expect.assertions(5);
      return expect(parser.parseTransactionPage({ url: links.history, body: pages.transactionList })
        .then((resp) => {
          expect(resp.url).toEqual(links.history);

          expect(Object.keys(resp.form).length).toEqual(40);
          expect(resp.transactions.length).toEqual(59);
          expect(resp.accounts.length).toEqual(4);

          return resp;
        })).resolves.toBeDefined();
    });
    test('should raise error if it\'s not transaction page.', () => {
      expect.assertions(1);
      return expect(
          parser.parseTransactionPage({ url: links.login, body: pages.login }))
        .rejects.toBeDefined();
    });
    test('should raise error if it\'s a page without form.', () => {
      expect.assertions(1);
      return expect(
          parser.parseTransactionPage({ url: links.history, body: pages.transactionPartial }))
        .rejects.toBeDefined();
    });
  });
});
