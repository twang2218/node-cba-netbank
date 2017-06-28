// Dependencies
const moment = require('moment');
const web = require('./web');
const parser = require('./parser');
const Url = require('url');
const debug = require('debug')('node-cba-netbank');

// Constant
const LINK = {
  BASE: 'https://www.my.commbank.com.au',
  LOGIN: '/netbank/Logon/Logon.aspx',
  TRANSACTION: '/netbank/TransactionHistory/History.aspx?RID=:RID&SID=:SID',
  EXPORT: '/netbank/TransactionHistory/Exports.aspx?RID=:RID&SID=:SID&ExportType=OFX',
};

//  Utilities
function toDateString(timestamp) {
  return moment(timestamp).utc().format('DD/MM/YYYY');
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
function lazyLoading(form, account) {
  return web
    .post({
      url: getUrl(account.url),
      form: {
        //  Send partial request
        ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjaxh',
        __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
        __EVENTARGUMENT: 'doPostBackApiCall|LoadRecentTransactions|false',
      },
      partial: true,
    })
    .then(parser.parseFormInPartialUpdate)
    .then(resp => Object.assign({}, resp, { form: Object.assign({}, resp.form, form) }));
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
          form: Object.assign(resp.form, {
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

function getMoreTransactions(form, account) {
  debug(`getMoreTransactions(account: ${account.name} [${account.number}] => ${account.available})`);
  const acc = Object.assign({}, account);
  // send the request
  return web
    .post({
      url: getUrl(account.link),
      form: {
        // fill the form
        ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjax',
        __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
        __EVENTARGUMENT: 'doPostBackApiCall|LoadTransactions|{"ClearCache":"false","IsSorted":false,"IsAdvancedSearch":true,"IsMonthSearch":false}',
      },
      partial: true,
    })
    .then(parser.parseTransactions)
    .then(refreshBase)
    .then((resp) => {
      debug(`after parser.parseTransactions(): resp.url => ${resp.url}`);
      acc.url = Url.parse(resp.url).path;
      if (resp.transactions.length === 0) {
        //  There is no more transactions
        return resp;
      }
      //  Received some transactions, and there may be more.
      return getMoreTransactions(form, account).then((r) => {
        if (!resp.transactions || resp.transactions.length <= 0) {
          throw new Error('getMoreTransactions() did not returned any transactions.');
        }
        //  add more transactions to previous batch.
        return Object.assign({}, resp, {
          transactions: concat(resp.transactions, r.transactions),
        });
      });
    });
}

function getTransactionsByDate(form, account, from, to) {
  debug(`getTransactionsByDate(account: ${account.name} [${account.number}] => ${account.available}, from: ${from}, to: ${to})`);
  const acc = Object.assign({}, account);
  return web
    .post({
      url: getUrl(account.link),
      form: {
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
      },
      partial: true,
    })
    .then(parser.parseTransactions)
    .then(refreshBase)
    .then((resp) => {
      acc.link = Url.parse(resp.url).path;
      if (resp.transactions.length === 0) {
        //  there is no transactions
        return resp;
      }
      //  we got some transactions, there might be more of them.
      return getMoreTransactions(form, account)
        .then((r) => {
          let transactions = resp.transactions;
          if (r.transactions.length > 0) {
            //  there are more transactions
            //  add more transactions to previous batch.
            transactions = concat(resp.transactions, r.transactions);
          }
          return Object.assign({}, resp, { transactions });
        })
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
          return getTransactionsByDate(form, account, from, newTo)
            .then((r) => {
              let transactions = resp.transactions;
              if (r.transactions.length > 0) {
                //  add more transactions to previous batch;
                transactions = concat(resp.transactions, r.transactions);
              }
              return Object.assign({}, resp, { transactions });
            })
            .catch(() => {
              //  cannot call it again, but we got some transactions at least,
              //  so, just call it a success.
              debug(error);
              debug('WARN: failed to call self again to load more');
              return resp;
            });
        });
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
    const from = toDateString(moment.utc().subtract(5, 'years').valueOf());
    const to = toDateString(moment.utc().valueOf());

    //  if the transaction section is lazy loading, we need do a panel update
    //  first, before the real search.
    if (!resp.form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$) {
      return lazyLoading(resp.form, acc).then(r => getTransactionsByDate(r.form, acc, from, to));
    }
    return getTransactionsByDate(resp.form, acc, from, to);
  });
}

//  Exports
module.exports = {
  login,
  getTransactions,
};
