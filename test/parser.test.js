/* eslint-disable no-undef */

// Dependencies
const cheerio = require('cheerio');
const parser = require('../src/parser');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const debug = require('debug')('node-cba-netbank');

moment.tz.setDefault('Australia/Sydney');

function load(filename) {
  return fs.readFileSync(path.resolve(path.resolve(__dirname, 'test_cases'), filename)).toString();
}

const pages = {
  //  login page
  logon: load('01-logon-page.html'),
  //  account list page
  home: load('02-home-page.html'),
  //  history page
  history: load('03-history-page.html'),
  //  partial history page
  historyPartial: load('04-history-partial.txt'),
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

const headersHtml = { 'content-type': 'text/html' };
const headersHtmlWithCharset = { 'content-type': 'text/html; charset=utf-8' };
const headersJson = { 'content-type': 'text/json' };

describe('parser.js', () => {
  describe('- parseTitle()', () => {
    test('should parse login page title to "Log on to NetBank"', () => {
      expect.assertions(3);
      return expect(
        parser.parseTitle({ url: links.login, headers: headersHtml, body: pages.logon }).then((resp) => {
          expect(resp.url).toEqual(links.login);
          expect(resp.title).toEqual('Log on to NetBank');
          return resp;
        }),
      ).resolves.toBeDefined();
    });
    test('should parse home page title to "Home"', () => {
      expect.assertions(3);
      return expect(
        parser.parseTitle({ url: links.home, headers: headersHtmlWithCharset, body: pages.home }).then((resp) => {
          expect(resp.url).toEqual(links.home);
          expect(resp.title).toEqual('Home');
          return resp;
        }),
      ).resolves.toBeDefined();
    });
    test('should parse history page title to "Transactions"', () => {
      expect.assertions(3);
      return expect(
        parser.parseTitle({ url: links.history, headers: headersHtml, body: pages.history }).then((resp) => {
          expect(resp.url).toEqual(links.history);
          expect(resp.title).toEqual('Transactions');
          return resp;
        }),
      ).resolves.toBeDefined();
    });
    test('should NOT parse partial page title', () => {
      expect.assertions(3);
      return expect(
        parser.parseTitle({ url: links.login, headers: headersHtml, body: pages.historyPartial }).then((resp) => {
          expect(resp.url).toEqual(links.login);
          expect(resp.title).not.toBeDefined();
          return resp;
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('- serializeArray()', () => {
    test('should get serialized form from HTML page (login page)', () => {
      const form = {};
      parser.serializeArray(cheerio.load(pages.logon)('form'), { disabled: true, button: true }).forEach((item) => {
        form[item.name] = item.value;
      });
      expect(Object.keys(form).length).toEqual(12);
    });
    test('should get serialized form from HTML page (home page)', () => {
      const form = {};
      parser.serializeArray(cheerio.load(pages.home)('form'), { disabled: true, button: true }).forEach((item) => {
        form[item.name] = item.value;
      });
      expect(Object.keys(form).length).toEqual(22);
    });
    test('should get serialized form from HTML page (history page)', () => {
      const form = {};
      parser
        .serializeArray(cheerio.load(pages.history)('form'), { disabled: true, button: true })
        .forEach((item) => {
          form[item.name] = item.value;
        });
      expect(Object.keys(form).length).toEqual(40);
    });
  });

  describe('- parseForm()', () => {
    function parseForm(body = pages.history) {
      return parser.parseForm({ url: links.login, headers: headersHtml, body }).then((resp) => {
        expect(resp.url).toEqual(links.login);
        return resp;
      });
    }

    test('should be able parse the properties', () => {
      expect.assertions(10);
      return expect(
        parseForm(pages.logon)
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
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should parse the value of properties', () => {
      expect.assertions(5);
      return expect(
        parseForm(pages.logon)
          .then((resp) => {
            expect(resp.form.RID).toEqual('TsFbWpAhjU6Q6Ub1pWwQEQ');
            expect(resp.form.btnLogon$field).toEqual('LOG ON');
            expect(resp.form.txtMyClientNumber$field).toEqual('');
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should parse <input type="radio" ...>', () => {
      expect.assertions(4);
      return expect(
        parseForm(pages.history)
          .then((resp) => {
            expect(resp.form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$).toEqual('AllTransactions');
            expect(resp.form.ctl00$BodyPlaceHolder$radioSwitchDateRange$field$).toEqual('TimePeriod');
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should parse <input type="checkbox" ...>', () => {
      expect.assertions(4);
      return expect(
        parseForm(pages.history)
          .then((resp) => {
            expect(resp.form.ctl00$ContentHeaderPlaceHolder$chkTxnScrolling$field).toEqual('on');
            expect(resp.form.ctl00$ContentHeaderPlaceHolder$chkMergeCreditDebit$field).toEqual('on');
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should parse <select><option ...>...</select>', () => {
      expect.assertions(4);
      return expect(
        parseForm(pages.history)
          .then((resp) => {
            expect(resp.form.ctl00$ContentHeaderPlaceHolder$ddlAccount$field).toEqual(
              '5218012345678901,MCD,True,True,True,False,True,False,True,False',
            );
            expect(resp.form.ctl00$BodyPlaceHolder$ddlDateRange$field).toEqual('3');
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should raise error if there is no form in the page', () => {
      expect.assertions(1);
      return expect(parseForm(pages.historyPartial)).rejects.toBeDefined();
    });
  });

  describe('- parseViewState()', () => {
    test('should be able parse the VIEWSTATE from partial page', () => {
      expect.assertions(8);
      return expect(
        parser
          .parseViewState({ url: links.login, headers: headersHtml, body: pages.historyPartial })
          .then((resp) => {
            /* eslint-disable dot-notation */
            expect(Object.keys(resp.form).length).toEqual(3);
            expect(resp.form).toHaveProperty('__VIEWSTATE');
            expect(resp.form['__VIEWSTATE'].length).toBeGreaterThan(1);
            expect(resp.form).toHaveProperty('__VIEWSTATEGENERATOR');
            expect(resp.form['__VIEWSTATEGENERATOR'].length).toBeGreaterThan(1);
            expect(resp.form).toHaveProperty('__EVENTVALIDATION');
            expect(resp.form['__EVENTVALIDATION'].length).toBeGreaterThan(1);
            /* eslint-enable dot-notation */
            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
  });

  describe('- parseAccountList()', () => {
    test('should parse account list', () => {
      expect.assertions((4 * 8) + 3);
      return expect(
        parser
          .parseAccountList({ url: links.home, headers: headersHtml, body: pages.home })
          .then((resp) => {
            expect(resp.url).toEqual(links.home);

            expect(resp.accounts.length).toEqual(4);

            expect(resp.accounts[0].name).toEqual('Smart Access');
            expect(resp.accounts[0].bsb).toEqual('062001');
            expect(resp.accounts[0].account).toEqual('12340001');
            expect(resp.accounts[0].number).toEqual('06200112340001');
            expect(resp.accounts[0].balance).toEqual(23.45);
            expect(resp.accounts[0].available).toEqual(-23.45);
            expect(resp.accounts[0].link.length).toBeGreaterThan(1);
            expect(resp.accounts[0].type).toEqual('DDA');

            expect(resp.accounts[1].name).toEqual('NetBank Saver');
            expect(resp.accounts[1].bsb).toEqual('062002');
            expect(resp.accounts[1].account).toEqual('12340012');
            expect(resp.accounts[1].number).toEqual('06200212340012');
            expect(resp.accounts[1].balance).toEqual(1234.50);
            expect(resp.accounts[1].available).toEqual(234.50);
            expect(resp.accounts[1].link.length).toBeGreaterThan(1);
            expect(resp.accounts[1].type).toEqual('DDA');

            expect(resp.accounts[2].name).toEqual('GoalSaver');
            expect(resp.accounts[2].bsb).toEqual('062003');
            expect(resp.accounts[2].account).toEqual('10000013');
            expect(resp.accounts[2].number).toEqual('06200310000013');
            expect(resp.accounts[2].balance).toEqual(76543.00);
            expect(resp.accounts[2].available).toEqual(76043.00);
            expect(resp.accounts[2].link.length).toBeGreaterThan(1);
            expect(resp.accounts[2].type).toEqual('DDA');

            expect(resp.accounts[3].name).toEqual('MasterCard Platinum');
            expect(resp.accounts[3].bsb).toEqual('');
            expect(resp.accounts[3].account).toEqual('5218012345678901');
            expect(resp.accounts[3].number).toEqual('5218012345678901');
            expect(resp.accounts[3].balance).toEqual(-123.45);
            expect(resp.accounts[3].available).toEqual(12345.67);
            expect(resp.accounts[3].link.length).toBeGreaterThan(1);
            expect(resp.accounts[3].type).toEqual('MCD');

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should raise error if there is no account list in the page', () => {
      expect.assertions(1);
      return expect(
        parser.parseAccountList({ url: links.login, headers: headersHtml, body: pages.logon }),
      ).rejects.toBeDefined();
    });
  });

  describe('- parseHomePage()', () => {
    test('should parse the submit form and account list', () => {
      expect.assertions(7);
      return expect(
        parser
          .parseHomePage({ url: links.home, headers: headersHtml, body: pages.home })
          .then((resp) => {
            expect(resp.url).toEqual(links.home);

            expect(resp.title).toEqual('Home');

            expect(resp.form).toHaveProperty('RID');
            expect(resp.form).toHaveProperty('SID');
            expect(resp.form).toHaveProperty('__EVENTVALIDATION');
            expect(resp.accounts.length).toEqual(4);

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should raise error if fail to parse the account list in the home page.', () => {
      expect.assertions(1);
      return expect(
        parser.parseHomePage({ url: links.login, headers: headersHtml, body: pages.logon }),
      ).rejects.toBeDefined();
    });
    test('should raise error if fail to parse the page at all', () => {
      expect.assertions(1);
      return expect(
        parser.parseHomePage({
          url: links.login,
          headers: headersJson,
          body: pages.historyPartial,
        }),
      ).rejects.toBeDefined();
    });
  });

  describe('- parseCurrencyHtml()', () => {
    const cases = [
      { currency: '12.34', post: 'CR', number: 12.34 },
      { currency: '1,234.56', post: 'CR', number: 1234.56 },
      { currency: '1,234,567.89', post: 'CR', number: 1234567.89 },
      { currency: '1,234.56', post: 'DR', number: -1234.56 },
      { currency: '1,234,567.89', post: 'DR', number: -1234567.89 },
    ];

    cases.forEach((c) => {
      test(`should parse "${c.currency} ${c.post}" to ${c.number}`, () => {
        expect(
          parser.parseCurrencyHtml(
            `<div class="FieldElement FieldElementLabel FieldElementNoLabel">
          <span class="CurrencySymbol CurrencyLabel PreFieldText">$</span>
          <span title="$" class="Currency field WithPostFieldText">${c.currency}</span>
          <span class="PostFieldText">${c.post}</span>
        </div>`,
          ),
        ).toEqual(c.number);
      });
    });
  });

  describe('- parseCurrencyText()', () => {
    const cases = [
      { text: '$300.00 DR', number: -300 },
      { text: '$610.04 CR', number: 610.04 },
      { text: '$3,000.00 CR', number: 3000 },
      { text: '$19.68 DR', number: -19.68 },
      { text: '$0.12 DR', number: -0.12 },
    ];

    cases.forEach((c) => {
      test(`should parse "${c.text}" to ${c.number}`, () => {
        expect(parser.parseCurrencyText(c.text)).toEqual(c.number);
      });
    });
  });

  describe('- parseTransaction()', () => {
    test('should parse JSON to Transaction object - case 1', () => {
      const json = JSON.parse(pages.transactionJson1);
      const t = parser.parseTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp);
      expect(date.year()).toEqual(2014);
      expect(date.month()).toEqual(11); //  month is zero indexed
      expect(date.date()).toEqual(1);
      expect(date.hours()).toEqual(7);
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
      const t = parser.parseTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp);
      expect(date.year()).toEqual(2014);
      expect(date.month()).toEqual(10);
      expect(date.date()).toEqual(20);
      expect(date.hours()).toEqual(19);
      expect(date.minutes()).toEqual(16);
      expect(date.seconds()).toEqual(41);
      expect(date.milliseconds()).toEqual(306);

      expect(t.description).toEqual('Transfer to xx0010 CommBank app');
      expect(t.amount).toEqual(-100);
      expect(t.balance).toEqual(20.67);
      expect(t.trancode).toEqual('550085');
      expect(t.receiptnumber).toEqual('N112044272766');
    });
    test('should parse JSON to Transaction object - case 3', () => {
      const json = JSON.parse(pages.transactionJson3);
      const t = parser.parseTransaction(json);
      expect(t).not.toBeNull();
      const date = moment(t.timestamp);
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
      const t = parser.parseTransaction(json);
      expect(t).toBeNull();
    });
  });

  describe('- parseTransactions()', () => {
    test('should parse a page to transction object array', () => {
      expect.assertions(14);
      return expect(
        parser
          .parseTransactions({
            url: links.history,
            headers: headersHtml,
            body: pages.history,
          })
          .then((resp) => {
            expect(resp.url).toEqual(links.history);

            expect(resp.transactions.length).toEqual(59);
            expect(moment(resp.transactions[0].timestamp).year()).toEqual(2015);
            expect(moment(resp.transactions[1].timestamp).month()).toEqual(3);
            expect(moment(resp.transactions[2].timestamp).date()).toEqual(25);
            expect(moment(resp.transactions[3].timestamp).hours()).toEqual(0);
            expect(moment(resp.transactions[4].timestamp).minutes()).toEqual(0);
            expect(moment(resp.transactions[5].timestamp).seconds()).toEqual(0);
            expect(resp.transactions[6].description).toEqual('INTEREST CHARGES');
            expect(resp.transactions[7].amount).toEqual(-5.5);
            expect(resp.transactions[8].balance).toEqual(0);
            expect(resp.transactions[9].trancode).toEqual('00 05');
            expect(resp.transactions[10].receiptnumber).toEqual('');

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should parse a PARTIAL page to transction object array', () => {
      expect.assertions(17);
      return expect(
        parser
          .parseTransactions({
            url: links.history,
            headers: headersJson,
            body: pages.historyPartial,
          })
          .then((resp) => {
            expect(resp.url).toEqual(links.history);

            expect(resp.title).not.toBeDefined();

            expect(resp.transactions.length).toEqual(40);
            expect(moment(resp.transactions[0].timestamp).year()).toEqual(2014);
            expect(moment(resp.transactions[1].timestamp).month()).toEqual(11);
            expect(moment(resp.transactions[2].timestamp).date()).toEqual(3);
            expect(moment(resp.transactions[3].timestamp).hours()).toEqual(7);
            expect(moment(resp.transactions[4].timestamp).minutes()).toEqual(52);
            expect(moment(resp.transactions[5].timestamp).seconds()).toEqual(15);
            expect(resp.transactions[6].description).toEqual('Transfer to xx0010 CommBank app');
            expect(resp.transactions[7].amount).toEqual(-600);
            expect(resp.transactions[8].balance).toEqual(680.67);
            expect(resp.transactions[9].trancode).toEqual('550085');
            expect(resp.transactions[10].receiptnumber).toEqual('N112744391641');
            expect(resp.more).toBeFalsy();
            expect(resp.limit).toBeFalsy();

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should raise error if it cannot parse the page', () => {
      expect.assertions(1);
      return expect(parser.parseTransactions({ url: links.login, body: pages.logon })).rejects.toBeDefined();
    });
  });

  describe('- parseAccountListWithKeys()', () => {
    test('should parse account list with the key of form', () => {
      expect.assertions(7);
      return expect(
        parser
          .parseAccountListWithKeys({
            url: links.history,
            headers: headersHtml,
            body: pages.history,
          })
          .then((resp) => {
            expect(resp.url).toEqual(links.history);

            expect(resp.accounts.length).toEqual(4);
            expect(resp.accounts[0].name).toEqual('Smart Access');
            expect(resp.accounts[1].number).toEqual('06200212340012');
            expect(resp.accounts[2].key).toEqual('200310000013,DDA,True,False,False,True,True,False,True,False');
            expect(resp.accounts[3].key).toEqual('5218012345678901,MCD,True,True,True,False,True,False,True,False');

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test('should raise error if there is no account list options in the page', () => {
      expect.assertions(1);
      return expect(parser.parseAccountListWithKeys({ url: links.login, body: pages.logon })).rejects.toBeDefined();
    });
  });

  describe('- parseTransactionPage()', () => {
    test('should parse the transaction page and get form, transactions and keys', () => {
      expect.assertions(7);
      return expect(
        parser
          .parseTransactionPage({
            url: links.history,
            headers: headersHtml,
            body: pages.history,
          })
          .then((resp) => {
            expect(resp.url).toEqual(links.history);

            expect(Object.keys(resp.form).length).toEqual(40);
            expect(resp.transactions.length).toEqual(59);
            expect(resp.more).toBeTruthy();
            expect(resp.limit).toBeFalsy();
            expect(resp.accounts.length).toEqual(4);

            return resp;
          })
          .catch((err) => {
            debug(err);
            throw err;
          }),
      ).resolves.toBeDefined();
    });
    test("should raise error if it's not transaction page.", () => {
      expect.assertions(1);
      return expect(parser.parseTransactionPage({ url: links.login, body: pages.logon })).rejects.toBeDefined();
    });
    test("should raise error if it's a page without form.", () => {
      expect.assertions(1);
      return expect(
        parser.parseTransactionPage({
          url: links.history,
          headers: headersJson,
          body: pages.historyPartial,
        }),
      ).rejects.toBeDefined();
    });
  });
});
