// Dependencies
const moment = require('moment');
const string = require('string');
const web = require('./web');
const parser = require('./parser');
const Set = require('collections/fast-set');
const Url = require('url');

// Constant
const LINK = {
  BASE: 'https://www.my.commbank.com.au',
  LOGIN: '/netbank/Logon/Logon.aspx',
  TRANSACTION: '/netbank/TransactionHistory/History.aspx?RID=:RID&SID=:SID',
  EXPORT: '/netbank/TransactionHistory/Exports.aspx?RID=:RID&SID=:SID&ExportType=OFX',
};

// Constructor
const API = {};

//  Utilities
function toDateString(timestamp) {
  return moment(timestamp).utc().format('DD/MM/YYYY');
}

//  Find whether those 2 transactions are exactly match.
function equal(left, right) {
  if (
    //  case 1. Have same receipt number, of course, it's not empty
    (!string(left.receiptnumber).isEmpty() &&
      left.receiptnumber === right.receiptnumber) ||
    //  case 2. Same time, same description and same amount
    (left.timestamp === right.timestamp &&
      left.description === right.description &&
      left.amount === right.amount)
  ) {
    return true;
  }
  return false;
}

function hash(transaction) {
  return transaction.timestamp.toString();
}

//  Add more items to base set.
function addAll(base, more) {
  const set = new Set(base, equal, hash);

  more.forEach((m) => {
    if (!set.has(m)) {
      base.push(m);
      set.add(m);
    }
  });
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
    .then(resp =>
      Object.assign({}, resp, { form: Object.assign({}, resp.form, form) }),
    );
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
  const acc = Object.assign({}, account);
  // send the request
  return web
    .post({
      url: getUrl(account.url),
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
      acc.url = Url.parse(resp.url).path;
      if (resp.transactions.length === 0) {
        //  There is no more transactions
        return resp;
      }
      //  Received some transactions, and there may be more.
      return getMoreTransactions(form, account).then((r) => {
        if (!resp.transactions || resp.transactions.length <= 0) {
          throw new Error(
            'getMoreTransactions() did not returned any transactions.',
          );
        }
        //  add more transactions to previous batch.
        addAll(resp.transactions, r.transactions);
        return resp;
      });
    });
}

function getTransactionsByDate(form, account, from, to) {
  const acc = Object.assign({}, account);
  return web
    .post({
      url: getUrl(account.url),
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
      acc.url = Url.parse(resp.url).path;
      if (resp.transactions.length === 0) {
        //  there is no transactions
        return resp;
      }
      //  we got some transactions, there might be more of them.
      return getMoreTransactions(form, account)
        .then((r) => {
          if (r.transactions.length > 0) {
            //  there are more transactions
            //  add more transactions to previous batch.
            addAll(resp.transactions, r.transactions);
          }
          return resp;
        })
        .catch((error) => {
          //  an error happend during load more, it means that it may have more,
          //  however, some restriction made it stopped, so we call it again,
          //  but this time, we use the eariliest date from the transactions
          //  we retrieved so far as the toDate, so it might workaround this
          //  problem.

          console.warn(error);

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
              if (r.transactions.length > 0) {
                //  add more transactions to previous batch;
                addAll(resp.transactions, r.transactions);
              }
              return resp;
            })
            .catch(() => {
              //  cannot call it again, but we got some transactions at least,
              //  so, just call it a success.
              console.warn(error);
              console.warn('WARN: failed to call self again to load more');
              return resp;
            });
        });
    });
}

function getTransactions(account) {
  const acc = Object.assign({}, account);
  //  retrieve post form and key for the given account
  return web
    .get(getUrl(account.url))
    .then(parser.parseTransactionPage)
    .then(refreshBase)
    .then((resp) => {
      acc.url = Url.parse(resp.url).path;
      if (resp.accounts !== null) {
        // Attach the account key value for searching
        acc.key = resp.accounts.filter(
          value => value.number === account.number,
        )[0].key;
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
        return lazyLoading(resp.form, acc).then(r =>
          getTransactionsByDate(r.form, acc, from, to),
        );
      }
      return getTransactionsByDate(resp.form, acc, from, to);
    });
}

API.login = function (confidential, callback) {
  web.get(
    {
      url: getUrl(LINK.LOGIN),
    },
    parser.parseForm,
    (error, url, form) => {
      if (error !== null) {
        callback(error);
        return;
      }

      refreshBase(url);

      //  fill the login form
      form.txtMyClientNumber$field = confidential.username;
      form.txtMyPassword$field = confidential.password;
      form.chkRemember$field = 'on';
      //  make JS detector happy
      form.JS = 'E';

      web.post(
        {
          url: getUrl(LINK.LOGIN),
          form,
        },
        parser.parseHomePage,
        (error, url, form, accounts) => {
          if (error !== null) {
            callback(error);
            return;
          }

          refreshBase(url);

          callback(null, accounts);
        },
      );
    },
  );
};

API.getMoreTransactions = function (form, account, callback) {
  // console.log(' => getMoreTransactions()');

  // fill the form
  form.ctl00$ctl00 =
    'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjax';
  form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$UpdatePanelForAjax';
  form.__EVENTARGUMENT =
    'doPostBackApiCall|LoadTransactions|{"ClearCache":"false","IsSorted":false,"IsAdvancedSearch":true,"IsMonthSearch":false}';

  // send the request
  web.post(
    {
      url: getUrl(account.url),
      form,
      partial: true,
    },
    parser.parseTransactions,
    (error, url, transactions) => {
      if (error === null) {
        refreshBase(url);
        account.url = Url.parse(url).path;

        if (transactions.length > 0) {
          API.getMoreTransactions(form, account, (error, more) => {
            if (error === null) {
              if (more.length > 0) {
                //  add more transactions to previous batch.
                addAll(transactions, more);
              }
              callback(null, transactions);
            } else {
              callback(error, transactions);
            }
          });
        } else {
          callback(null, transactions);
        }
      } else {
        callback(error);
      }
    },
  );
};

API.getTransactionsByDate = function (form, account, from, to, callback) {
  // console.log(' => getTransactionsByDate(' + from + ' => ' + to + ')');
  // fill the form
  form.ctl00$ctl00 =
    'ctl00$BodyPlaceHolder$updatePanelSearch|ctl00$BodyPlaceHolder$lbSearch';
  form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$lbSearch';
  form.__EVENTARGUMENT = '';
  form.ctl00$BodyPlaceHolder$searchTypeField = '1';
  form.ctl00$BodyPlaceHolder$radioSwitchDateRange$field$ = 'ChooseDates';
  form.ctl00$BodyPlaceHolder$dateRangeField = 'ChooseDates';
  form.ctl00$BodyPlaceHolder$fromCalTxtBox$field = from;
  form.ctl00$BodyPlaceHolder$toCalTxtBox$field = to;

  //  Add this for partial update
  form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$ = 'AllTransactions';

  // send the request
  web.post(
    {
      url: getUrl(account.url),
      form,
      partial: true,
    },
    parser.parseTransactions,
    (error, url, transactions) => {
      if (error === null) {
        refreshBase(url);
        account.url = Url.parse(url).path;

        if (transactions.length > 0) {
          API.getMoreTransactions(form, account, (error, more) => {
            if (error === null) {
              if (more.length > 0) {
                //  add more transactions to previous batch.
                addAll(transactions, more);
              }
              callback(null, transactions);
            } else {
              //  an error happend during load more, mean it should have more,
              //  however, some restriction made it stopped, so we call it again,
              //  but this time, we use the eariliest date from the transactions
              //  we retrieved so far as the toDate, so it might workaround this
              //  problem.

              // console.warn(error);

              //  create the new to date
              let timestamp = transactions[0].timestamp;
              for (const index in transactions) {
                const t1 = transactions[index].timestamp;
                if (timestamp > t1) {
                  timestamp = t1;
                }
              }

              // Call self again
              API.getTransactionsByDate(
                form,
                account,
                from,
                toDateString(timestamp),
                (error, moreAgain) => {
                  if (error === null) {
                    if (moreAgain.length > 0) {
                      //  add more transactions to previous batch;
                      addAll(transactions, moreAgain);
                    }
                    callback(null, transactions);
                  } else {
                    //  cannot call it again, but we got some transactions at least,
                    //  so, just call it a success.
                    console.warn(
                      'WARN: failed to call self again to load more',
                    );
                    callback(null, transactions);
                  }
                },
              );
            }
          });
        } else {
          callback(null, transactions);
        }
      } else {
        callback(error);
      }
    },
  );
};

//  If the search panel is lazy loading, not only the transactions data is not in
//  the page, the search page widget is not ready as well. So, search request will
//  fail. To workaround such problem, we send an update panel partial callback
//  first,let server side prepared the search panel and download transaction.
//  Then, do the real search using the information from the parital callback result.
function lazyLoadingTransaction(form, account, callback) {
  //  Send partial request
  form.ctl00$ctl00 =
    'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjaxh';
  form.__EVENTTARGET = 'ctl00$BodyPlaceHolder$UpdatePanelForAjax';
  form.__EVENTARGUMENT = 'doPostBackApiCall|LoadRecentTransactions|false';

  web.post(
    {
      url: getUrl(account.url),
      form,
      partial: true,
    },
    parser.parseFormInPartialUpdate,
    (error, url, formPartial) => {
      if (error === null && formPartial !== null) {
        for (const index in formPartial) {
          form[index] = formPartial[index];
        }
        callback(null, form);
      } else {
        callback(error);
      }
    },
  );
}

API.getTransactions = function (account, callback) {
  //  retrieve post form and key for the given account
  web.get(
    {
      url: getUrl(account.url),
    },
    parser.parseTransactionPage,
    (error, url, form, transactions, keys) => {
      if (error !== null && form === null) {
        callback(error);
        return;
      }

      refreshBase(url);
      account.url = Url.parse(url).path;

      if (keys !== null) {
        // Attach the account key value for searching
        account.key = keys.filter(value => value.number === account.number)[
          0
        ].key;
      }

      //  Download range from now to 5 years ago, as normally bank doesn't
      //  keep transactions log for too long. FYI, tried 8 years without error
      //  message in the first place, however, bank only stored 2 years transactions
      //  data.
      const from = toDateString(moment.utc().subtract(5, 'years').valueOf());
      const to = toDateString(moment.utc().valueOf());

      //  if the transaction section is lazy loading, we need do a panel update
      //  first, before the real search.
      if (
        typeof form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$ ===
        'undefined'
      ) {
        lazyLoadingTransaction(form, account, (error, form) => {
          if (error === null) {
            API.getTransactionsByDate(
              form,
              account,
              from,
              to,
              (error, transactions) => {
                callback(error, transactions);
              },
            );
          } else {
            callback(error);
          }
        });
      } else {
        API.getTransactionsByDate(
          form,
          account,
          from,
          to,
          (error, transactions) => {
            callback(error, transactions);
          },
        );
      }
    },
  );
};

//  Exports
module.exports = {
  login,
  getTransactions,
};
