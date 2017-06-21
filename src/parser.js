// Dependencies
const cheerio = require('cheerio');
const string = require('string');
const moment = require('moment');
const debug = require('debug')('node-cba-netbank');

const submittableSelector = 'input,select,textarea,keygen';
const rCRLF = /\r?\n/g;

//  Utilities
//  reference: https://github.com/cheeriojs/cheerio/blob/master/lib/api/forms.js
//  Add support for allow `disabled` and `button` input element in the serialized array.
function serializeArray(element, options = { disabled: false, button: false }) {
  // Resolve all form elements from either forms or collections of form elements
  return element.map((i, elem) => {
    const $elem = cheerio(elem);
    if (elem.name === 'form') {
      return $elem.find(submittableSelector).toArray();
    }
    return $elem.filter(submittableSelector).toArray();
  }).filter(
    // Verify elements have a name (`attr.name`)
    `[name!=""]${
        // and are not disabled (`:disabled`) if `options.disabled === false`
         options.disabled ? '' : ':not(:disabled)'
        // and or
         }:not(${
        // and cannot be clicked (`[type=submit]`) if `options.button === true`
         options.button ? '' : ':submit, :button, '
        // are used in `x-www-form-urlencoded` (`[type=file]`)
         }:image, :reset, :file)`
    // and are either checked/don't have a checkable state
    +
    ':matches([checked], :not(:checkbox, :radio))',
    // Convert each of the elements to its value(s)
  ).map((i, elem) => {
    const $elem = cheerio(elem);
    const name = $elem.attr('name');
    let value = $elem.val();

    // If there is no value set (e.g. `undefined`, `null`), then default value to empty
    if (value == null) {
      value = ($elem.attr('type') === 'checkbox') ? 'on' : '';
    }

    // If we have an array of values (e.g. `<select multiple>`),
    // return an array of key/value pairs
    if (Array.isArray(value)) {
      return value.map(val =>
        // We trim replace any line endings (e.g. `\r` or `\r\n` with `\r\n`)
        // to guarantee consistency across platforms
        //   These can occur inside of `<textarea>'s`
        ({ name, value: val.replace(rCRLF, '\r\n') }));
      // Otherwise (e.g. `<input type="text">`, return only one key/value pair
    }
    return { name, value: value.replace(rCRLF, '\r\n') };

    // Convert our result to an array
  }).get();
}

//  parse the balance to a double number.
//  Positive is CR, and negative is DR.
function parseCurrency(text) {
  let amount = Number(text.replace(/[^0-9.]+/g, ''));
  if (text.indexOf('DR') > -1) {
    amount = -amount;
  }
  return amount;
}

function extractTransactionJsonArray(page) {
  const begin = page.indexOf('{"Transactions');
  let end = -1;
  if (begin === -1) {
    // debug('Cannot find beginning of the transactions.');
    return null;
  }
  //  find the transactions block
  // debug('  begin at ' + begin);
  let embedded = 1;
  for (let i = begin + 1; i <= page.length; i += 1) {
    const c = page.charAt(i);
    switch (c) {
      case '{':
        embedded += 1;
        break;
      case '}':
        embedded -= 1;
        break;
      default:
        break;
    }
    if (embedded === 0) {
      end = i + 1;
      // debug('  end at ' + end);
      break;
    }
  }

  return JSON.parse(page.substring(begin, end)).Transactions;
}

// Transaction format
// {
//  timestamp,
//  date,
//  description,
//  amount,
//  balance,
//  trancode,
//  receiptnumber
// }
function parseJsonToTransaction(json) {
  try {
    const transaction = {};

    //  try parse the date from 'Sort.Text' first
    const dateTag = json.Date.Sort[1];
    let t = moment.utc(dateTag, 'YYYYMMDDHHmmssSSS');
    if (!t.isValid()) {
      //  try parse the date from 'Date.Text' if previous failed
      t = moment.utc(json.Date.Text, 'DD MMM YYYY');
      //  use sort order to distinguish different transactions.
      if (!string(dateTag).isEmpty() && !isNaN(+dateTag)) {
        t.millisecond(+dateTag);
      }
    }
    transaction.timestamp = t.valueOf();

    transaction.date = t.toISOString();
    transaction.description = json.Description.Text;
    transaction.amount = parseCurrency(json.Amount.Text);
    transaction.balance = parseCurrency(json.Balance.Text);
    transaction.trancode = json.TranCode.Text;
    transaction.receiptnumber = string(json.ReceiptNumber.Text).isEmpty() ? '' : json.ReceiptNumber.Text;

    return transaction;
  } catch (err) {
    debug(json);
    debug(err);
    return null;
  }
}

// Parsers

function parseForm(resp) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(resp.body);
    const formElement = $('form');
    if (formElement.length === 0) {
      reject('Cannot find form in the page');
    }

    // serializeForm(formElement)
    const form = {};
    serializeArray(formElement, { disabled: true, button: true })
      .forEach((item) => { form[item.name] = item.value; });
    resolve(Object.assign(resp, { form }));
  });
}

function parseFormInPartialUpdate(resp) {
  return new Promise((resolve, reject) => {
    //  get form section
    const $ = cheerio.load(resp.body);

    const form = {};
    serializeArray($, { disabled: true, button: true })
      .forEach((item) => { form[item.name] = item.value; });

    if (form.length === 0) {
      reject('Cannot find form element in partial update');
    } else {
      resolve(Object.assign(resp, { form }));
    }

    //  get new view state of asp.net
    const REGEX_VIEW_STATE = /(__VIEWSTATE|__EVENTVALIDATION|__VIEWSTATEGENERATOR)\|([^|]+)\|/g;
    const matches = resp.body.match(REGEX_VIEW_STATE);
    if (matches) {
      form[matches[1]] = matches[2];
    }

    resolve(Object.assign(resp, { form }));
  });
}

//  Account format:
// {
//  nickname,
//  url,
//  bsbNumber,
//  accountNumber,
//  number,
//  balance
// }
function parseAccountList(resp) {
  return new Promise((resolve, reject) => {
    const accounts = [];

    const $ = cheerio.load(resp.body);
    const accountRow = $('div#myPortfolioDiv').find('tr.main_group_account_row');

    if (accountRow.length <= 0) {
      reject('Cannot find account list.');
    }

    accountRow.each((i, e) => {
      const account = {};
      const tag = $(e).find('td.NicknameField a');
      account.nickname = tag.html();
      account.url = tag.attr('href');
      account.bsbNumber = $(e).find('td.BSBField span.text').html();
      if (string(account.bsbNumber).isEmpty()) {
        account.bsbNumber = '';
      }
      account.accountNumber = $(e).find('td.AccountNumberField span.text').html();
      account.number = (account.bsbNumber + account.accountNumber).replace(/\s+/g, '');

      account.balance = parseCurrency(
        `${$(e).find('td.AccountBalanceField span.Currency').html()} ${
          $(e).find('td.AccountBalanceField span.PostFieldText').html()}`,
      );

      account.availableFunds = parseCurrency(
        `${$(e).find('td.AvailableFundsField span.Currency').html()} ${$(e).find(
          'td.AvailableFundsField span.PostFieldText').html()}`,
      );

      //  validate the account info
      if (!string(account.nickname).isEmpty() && !string(account.url).isEmpty() &&
        !string(account.accountNumber).isEmpty()) {
        accounts.push(account);
      }
    });
    resolve(Object.assign(resp, { accounts }));
  });
}

function parseHomePage(resp) {
  return parseForm(resp).then(parseAccountList);
}

function parseTransactions(resp) {
  return new Promise((resolve, reject) => {
    const transactions = [];
    const jsonArray = extractTransactionJsonArray(resp.body);
    if (!jsonArray) {
      reject('Cannot find transaction section.');
    } else {
      jsonArray.forEach((t) => {
        const transaction = parseJsonToTransaction(t);
        if (transaction !== null) {
          transactions.push(transaction);
        } else {
          //  just ignore the misformed transactions;
          debug(`Cannot parse a transaction: ${t.toString()}`);
        }
      });
      resolve(Object.assign(resp, { transactions }));
    }
  });
}

// AccountWithKeys
// {
//  nickname,
//  number,
//  key
// }
function parseAccountKeys(resp) {
  return new Promise((resolve, reject) => {
    const accounts = [];
    const $ = cheerio.load(resp.body);
    $('select').each((i, e) => {
      $(e).find('option').each((index, element) => {
        // debug(`{ ${index}: ${$(element).html()} }`);
        const account = {};

        const titles = $(element).html().split('|', 2);
        if (titles.length > 1) {
          account.nickname = titles[0].trim();
          account.number = titles[1].replace(/\s+/g, '');
        }
        account.key = $(element).attr('value');
        if (account.key.length > 0 && titles.length > 1) {
          accounts.push(account);
        }
      });
    });

    if (accounts.length > 0) {
      resolve(Object.assign(resp, { accounts }));
    } else {
      reject('Cannot find accounts keys');
    }
  });
}

function parseTransactionPage(resp) {
  return parseForm(resp)
    .then(parseTransactions)
    .then(parseAccountKeys);
}

module.exports = {
  parseForm,
  parseFormInPartialUpdate,
  parseAccountList,
  parseHomePage,
  parseCurrency,
  extractTransactionJsonArray,
  parseJsonToTransaction,
  parseTransactions,
  parseAccountKeys,
  parseTransactionPage,
};
