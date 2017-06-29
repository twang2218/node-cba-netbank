// Dependencies
const Promise = require('bluebird');
const cheerio = require('cheerio');
const moment = require('moment');
const debug = require('debug')('node-cba-netbank');

const submittableSelector = 'input,select,textarea,keygen';
const rCRLF = /\r?\n/g;

//  Utilities
//  reference: https://github.com/cheeriojs/cheerio/blob/master/lib/api/forms.js
//  Add support for allow `disabled` and `button` input element in the serialized array.
function serializeArray(element, options = { disabled: false, button: false }) {
  // Resolve all form elements from either forms or collections of form elements
  return element
    .map((i, elem) => {
      const $elem = cheerio(elem);
      if (elem.name === 'form') {
        return $elem.find(submittableSelector).toArray();
      }
      return $elem.filter(submittableSelector).toArray();
    })
    .filter(
      // Verify elements have a name (`attr.name`)
      // and are not disabled (`:disabled`) if `options.disabled === false`
      // and cannot be clicked (`[type=submit]`) if `options.button === true`
      // are used in 'x-www-form-urlencoded' ('[type=file]')
      `[name!=""]${options.disabled ? '' : ':not(:disabled)'}:not(${options.button ? '' : ':submit, :button, '}:image, :reset, :file)` +
        // and are either checked/don't have a checkable state
        ':matches([checked], :not(:checkbox, :radio))',
      // Convert each of the elements to its value(s)
    )
    .map((i, elem) => {
      const $elem = cheerio(elem);
      const name = $elem.attr('name');
      let value = $elem.val();

      // If there is no value set (e.g. `undefined`, `null`), then default value to empty
      if (value == null) {
        value = $elem.attr('type') === 'checkbox' ? 'on' : '';
      }

      // If we have an array of values (e.g. `<select multiple>`),
      // return an array of key/value pairs
      if (Array.isArray(value)) {
        return value.map(val => ({ name, value: val.replace(rCRLF, '\r\n') })); //   These can occur inside of `<textarea>'s` // to guarantee consistency across platforms // We trim replace any line endings (e.g. `\r` or `\r\n` with `\r\n`)
        // Otherwise (e.g. `<input type="text">`, return only one key/value pair
      }
      return { name, value: value.replace(rCRLF, '\r\n') };

      // Convert our result to an array
    })
    .get();
}

//  parse the balance to a double number.
//  e.g. '$1,766.50 CR', '$123.00 DR'
//  Positive is CR, and negative is DR.
function parseCurrencyText(text) {
  let amount = Number(text.replace(/[^0-9.]+/g, ''));
  if (text.indexOf('DR') > -1) {
    amount = -amount;
  }
  return amount;
}

//  Parse:
// <div class="FieldElement FieldElementLabel FieldElementNoLabel">
//   <span class="CurrencySymbol CurrencyLabel PreFieldText">$</span>
//   <span title="$" class="Currency field WithPostFieldText">1,767.44</span>
//   <span class="PostFieldText">CR</span>
// </div>
//  to Number `1767.44`.
function parseCurrencyHtml(elem) {
  const e = cheerio.load(`<div>${elem}</div>`);
  const currency = parseFloat(e('.Currency').text().replace(/,/g, '').trim());
  if (e('.PostFieldText').text().trim() === 'DR') {
    return -currency;
  }
  return currency;
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
function parseTransaction(json) {
  try {
    //  try parse the date from 'Date.Sort[1]' first
    const dateTag = json.Date.Sort[1];
    let t = moment.utc(dateTag, 'YYYYMMDDHHmmssSSS');
    if (!t.isValid()) {
      //  try parse the date from 'Date.Text' if previous attempt failed
      t = moment.utc(json.Date.Text, 'DD MMM YYYY');
      //  use sort order to distinguish different transactions.
      if (dateTag && !isNaN(+dateTag)) {
        t.millisecond(+dateTag);
      }
    }

    return {
      timestamp: t.valueOf(),
      date: t.toISOString(),
      description: json.Description.Text || '',
      amount: parseCurrencyText(json.Amount.Text),
      balance: parseCurrencyText(json.Balance.Text),
      trancode: json.TranCode.Text || '',
      receiptnumber: json.ReceiptNumber.Text || '',
    };
  } catch (err) {
    //  ignore the error for the misformatted transaction, and return null.
    debug(err);
    debug(`Cannot parse the given transaction: ${JSON.stringify(json)}`);
    return null;
  }
}

// Parsers

function parseForm(resp) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(resp.body);

    //  Parse Title
    let title;
    if (resp.headers['content-type'] === 'text/html') {
      title = $('title').text().trim();
      debug(`parseForm(): title => ${title}`);
    }

    //  Parse Form
    const formElement = $('form');
    if (formElement.length === 0) {
      return reject('Cannot find form in the page');
    }

    // serializeForm(formElement)
    const form = {};
    serializeArray(formElement, { disabled: true, button: true }).forEach((item) => {
      form[item.name] = item.value;
    });
    return resolve(Object.assign({}, resp, { form, title }));
  });
}

function parseFormInPartialUpdate(resp) {
  return new Promise((resolve, reject) => {
    //  get form section
    const $ = cheerio.load(resp.body);

    const form = {};
    serializeArray($, { disabled: true, button: true }).forEach((item) => {
      form[item.name] = item.value;
    });

    if (form.length === 0) {
      return reject('Cannot find form element in partial update');
    }

    //  get new view state of asp.net
    const REGEX_VIEW_STATE = /(__VIEWSTATE|__EVENTVALIDATION|__VIEWSTATEGENERATOR)\|([^|]+)\|/g;
    let match = REGEX_VIEW_STATE.exec(resp.body);
    while (match) {
      form[match[1]] = match[2];
      match = REGEX_VIEW_STATE.exec(resp.body);
    }

    return resolve(Object.assign({}, resp, { form }));
  });
}

//  Account format:
// {
//  name,
//  link,
//  bsb,
//  account,
//  number: {bsb+account}
//  balance
// }
function parseAccountList(resp) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(resp.body);
    const accountRows = $('.main_group_account_row');

    if (!accountRows || accountRows.length === 0) {
      return reject('Cannot find account list.');
    }

    let accounts = [];
    accountRows.each((index, elem) => {
      const $$ = cheerio.load(elem);
      accounts.push({
        name: $$('.NicknameField .left a').text().trim(),
        link: $$('.NicknameField .left a').attr('href'),
        bsb: $$('.BSBField .text').text().replace(/\s+/g, '').trim(),
        account: $$('.AccountNumberField .text').text().replace(/\s+/g, '').trim(),
        balance: parseCurrencyHtml($$('.AccountBalanceField')),
        available: parseCurrencyHtml($$('.AvailableFundsField')),
      });
    });

    accounts = accounts
      //  Assemble the `bsb` and `account` to construct `number`
      .map(acc => Object.assign({}, acc, { number: `${acc.bsb}${acc.account}` }))
      //  validate the account info
      .filter(acc => acc.name && acc.link && acc.account);

    debug(`parseAccountList(): found ${accounts.length} accounts`);
    return resolve(Object.assign({}, resp, { accounts }));
  });
}

function parseHomePage(resp) {
  return parseForm(resp).then(parseAccountList);
}

function parseTransactions(resp) {
  return new Promise((resolve, reject) => {
    //  Get transactions
    let m = /Transactions":(\[.*),"OutstandingAuthorizations"/.exec(resp.body);
    let transactions;
    if (m) {
      transactions = JSON.parse(m[1]).map(parseTransaction).filter(v => !!v);
      debug(`parseTransactions(): found ${transactions.length} transactions`);
      //  Get whether there is more transations to load.
      m = /"More":(\w+),/.exec(resp.body);
      let more = false;
      if (m) {
        more = m[1] === 'true';
        debug(`parseTransactions(): There is ${more ? '' : 'NO '}more transactions.`);
      }
      return resolve(Object.assign({}, resp, { transactions, more }));
    }
    return reject('Cannot find transactions in the resp');
  });
}

//  Parse the account list from TransactionHistory/History.aspx page
// AccountWithKeys
// {
//  name,
//  number,
//  key
// }
function parseAccountListWithKeys(resp) {
  return new Promise((resolve, reject) => {
    const $ = cheerio.load(resp.body);
    const accounts = [];

    $('#ctl00_ContentHeaderPlaceHolder_updatePanelAccount').find('option').each((i, e) => {
      const texts = $(e).text().split('|').map(t => t.trim());
      if (texts.length === 2) {
        const acc = {
          name: texts[0],
          number: texts[1].replace(/\s+/g, ''),
          key: $(e).attr('value'),
        };
        if (acc.key && acc.number && acc.name) {
          accounts.push(acc);
        }
      }
    });

    if (accounts.length > 0) {
      resolve(Object.assign({}, resp, { accounts }));
    } else {
      reject('Cannot find accounts keys');
    }
  });
}


function parseTransactionPage(resp) {
  return parseForm(resp).then(parseTransactions).then(parseAccountListWithKeys);
}

module.exports = {
  parseForm,
  parseFormInPartialUpdate,
  parseAccountList,
  parseHomePage,
  parseCurrencyText,
  parseCurrencyHtml,
  parseTransaction,
  parseTransactions,
  parseAccountListWithKeys,
  parseTransactionPage,
};
