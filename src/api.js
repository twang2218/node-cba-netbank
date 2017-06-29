// Dependencies
const moment = require('moment-timezone');
const web = require('./web');
const parser = require('./parser');
const Url = require('url');
const debug = require('debug')('node-cba-netbank');

// Constant
moment.tz.setDefault('Australia/Sydney');
const LINK = {
  BASE: 'https://www.my.commbank.com.au',
  LOGIN: '/netbank/Logon/Logon.aspx',
  TRANSACTION: '/netbank/TransactionHistory/History.aspx?RID=:RID&SID=:SID',
  EXPORT: '/netbank/TransactionHistory/Exports.aspx?RID=:RID&SID=:SID&ExportType=OFX',
};

//  Utilities
function toDateString(timestamp) {
  return moment(timestamp).format('DD/MM/YYYY');
}

const isSameTransaction = (left, right) =>
  //  case 1. Have same receipt number, of course, it's not empty
  (left.receiptnumber && left.receiptnumber === right.receiptnumber) ||
  //  case 2. Same time, same description and same amount
  (left.timestamp === right.timestamp && left.description === right.description && left.amount === right.amount);

//  concat 2 transactionList without any duplications.
function concat(a, b) {
  return a.concat(b.filter(vb => !a.find(va => isSameTransaction(va, vb))));
}

//  Return `${LINK.BASE}+${path}`
function getUrl(path) {
  return Url.resolve(LINK.BASE, path);
}

//  Change the BASE link if it's been redirected.
function refreshBase(resp) {
  const oldLink = Url.parse(LINK.BASE);
  const newLink = Url.parse(resp.url);

  if (oldLink.host !== newLink.host) {
    debug(`refreshBase(${oldLink.host} => ${newLink.host}`);
    oldLink.host = newLink.host;
    LINK.BASE = Url.format(oldLink);
  }
  return resp;
}

//  If the search panel is lazy loading, not only the transactions data is not in
//  the page, the search page widget is not ready as well. So, search request will
//  fail. To workaround such problem, we send an update panel partial callback
//  first,let server side prepared the search panel and download transaction.
//  Then, do the real search using the information from the parital callback result.
function lazyLoading(response, account) {
  debug(`lazyLoading(account: ${account.name} [${account.number}] => ${account.available}))`);
  return web
    .post({
      url: getUrl(account.link),
      form: Object.assign({}, response.form, {
        //  Send partial request
        ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjaxh',
        __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
        __EVENTARGUMENT: 'doPostBackApiCall|LoadRecentTransactions|false',
      }),
      partial: true,
    })
    .then(parser.parseFormInPartialUpdate)
    .then(resp => Object.assign({}, resp, { form: Object.assign({}, response.form, resp.form) }));
}

//  API
function login(credentials) {
  //  retrieve the login page
  return (
    web
      .get(getUrl(LINK.LOGIN))
      //  Parse the page to get login form
      .then(refreshBase)
      .then(parser.parseForm)
      .then(resp =>
        //  fill the login form and submit
        web.post({
          url: getUrl(LINK.LOGIN),
          form: Object.assign({}, resp.form, {
            txtMyClientNumber$field: credentials.username,
            txtMyPassword$field: credentials.password,
            chkRemember$field: 'on',
            //  and make JS detector happy
            JS: 'E',
          }),
        }),
      )
      .then(refreshBase)
      //  parse the home page to retrieve the accounts list
      .then(parser.parseHomePage)
  );
}

function getMoreTransactions(response, account) {
  debug(`getMoreTransactions(account: ${account.name} [${account.number}] => ${account.available})`);
  const acc = Object.assign({}, account);
  const responseWithForm = Object.assign({}, response, {
    form: Object.assign({}, response.form, {
      // fill the form
      ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjax',
      __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
      __EVENTARGUMENT: 'doPostBackApiCall|LoadTransactions|{"ClearCache":"false","IsSorted":false,"IsAdvancedSearch":true,"IsMonthSearch":false}',
    }),
  });
  // send the request
  return web
    .post({
      url: getUrl(account.link),
      form: responseWithForm.form,
      partial: true,
    })
    .then(parser.parseTransactions)
    .then(refreshBase)
    .then((resp) => {
      acc.link = Url.parse(resp.url).path;
      if (!resp.more || resp.limit) {
        //  There is no more transactions or reached the limit.
        return resp;
      }
      return (
        getMoreTransactions(responseWithForm, account)
          //  concat more transactions.
          .then(r => Object.assign({}, responseWithForm, { transactions: concat(resp.transactions, r.transactions) }))
          //  Ignore the error as we have got some transactions already
          .catch((error) => {
            debug(error);
            return resp;
          })
      );
    });
}

function getTransactionsByDate(response, account, from, to) {
  debug(
    `getTransactionsByDate(account: ${account.name} [${account.number}] => ${account.available}, from: ${from}, to: ${to})`,
  );
  const acc = Object.assign({}, account);
  const responseWithForm = Object.assign({}, response, {
    form: Object.assign({}, response.form, {
      // fill the form
      ctl00$ctl00: 'ctl00$BodyPlaceHolder$updatePanelSearch|ctl00$BodyPlaceHolder$lbSearch',
      __EVENTTARGET: 'ctl00$BodyPlaceHolder$lbSearch',
      __EVENTARGUMENT: '',
      ctl00$BodyPlaceHolder$searchTypeField: '1',
      ctl00$BodyPlaceHolder$radioSwitchDateRange$field$: 'ChooseDates',
      ctl00$BodyPlaceHolder$dateRangeField: 'ChooseDates',
      ctl00$BodyPlaceHolder$fromCalTxtBox$field: from,
      ctl00$BodyPlaceHolder$toCalTxtBox$field: to,
      //  Add this for partial update
      ctl00$BodyPlaceHolder$radioSwitchSearchType$field$: 'AllTransactions',
    }),
  });

  return web
    .post({
      url: getUrl(account.link),
      form: responseWithForm.form,
      partial: true,
    })
    .then(parser.parseTransactions)
    .then(refreshBase)
    .then((resp) => {
      acc.link = Url.parse(resp.url).path;
      if (!resp.more || resp.limit) {
        //  there is no more transactions or reached the limit.
        return resp;
      }
      //  we got some transactions, there might be more of them.
      return (
        getMoreTransactions(responseWithForm, account)
          //  concat more transactions.
          .then(r => Object.assign({}, responseWithForm, { transactions: concat(resp.transactions, r.transactions) }))
          .catch((error) => {
            //  an error happend during load more, it means that it may have more,
            //  however, some restriction made it stopped, so we call it again,
            //  but this time, we use the eariliest date from the transactions
            //  we retrieved so far as the toDate, so it might workaround this
            //  problem.

            debug(error);

            //  find the earliest date as 'to' date.
            let timestamp = resp.transactions[0].timestamp;
            resp.transactions.forEach((t) => {
              if (timestamp > t.timestamp) {
                timestamp = t.timestamp;
              }
            });
            const newTo = toDateString(timestamp);

            // Call self again
            debug('getTransactionsByDate(): Got error during loading, so call self again to give it another try');
            return (
              getTransactionsByDate(responseWithForm, account, from, newTo)
                //  concat more transactions
                .then(r =>
                  Object.assign({}, responseWithForm, { transactions: concat(resp.transactions, r.transactions) }),
                )
                .catch(() => {
                  //  cannot call it again, but we got some transactions at least,
                  //  so, just call it a success.
                  debug(error);
                  debug('getTransactionsByDate(): failed to call self again to load more');
                  return Object.assign({}, responseWithForm, { transactions: resp.transactions });
                })
            );
          })
      );
    });
}

function getTransactions(account) {
  debug(`getTransactions(account: ${account.name} [${account.number}] => ${account.available})`);
  const acc = Object.assign({}, account);
  //  retrieve post form and key for the given account
  return web.get(getUrl(account.link)).then(parser.parseTransactionPage).then(refreshBase).then((resp) => {
    acc.link = Url.parse(resp.url).path;
    if (resp.accounts !== null) {
      acc.key = resp.accounts.find(a => a.number === account.number).key;
    }

    //  Download range from now to 5 years ago, as normally bank doesn't
    //  keep transactions log for too long. FYI, tried 8 years without error
    //  message in the first place, however, bank only stored 2 years transactions
    //  data.
    const from = toDateString(moment().subtract(2, 'years').valueOf());
    const to = toDateString(moment().valueOf());

    //  if the transaction section is lazy loading, we need do a panel update
    //  first, before the real search.
    if (!resp.form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$) {
      return lazyLoading(resp, acc).then(r => getTransactionsByDate(r, acc, from, to));
    }
    return getTransactionsByDate(resp, acc, from, to).then((r) => {
      debug(`getTransactions(): Total received ${r.transactions.length} transactions.`);
      return r;
    });
  });
}

//  Exports
module.exports = {
  login,
  getTransactions,
};
