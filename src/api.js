// Dependencies
const debug = require('debug')('node-cba-netbank');
const moment = require('./moment');
const WebClient = require('./web');
const parser = require('./parser');
const Url = require('url');
const uniq = require('lodash/uniq');

// Constant
const NETBANK_HOST = 'https://www.my.commbank.com.au';
const PATH = {
  LOGON: '/netbank/Logon/Logon.aspx',
  HOME: '/netbank/Portfolio/Home/Home.aspx?RID=:RID&SID=:SID',
};

const SixYearsAgo = moment().subtract(6, 'years').format(moment.formats.default);
const Today = moment().format(moment.formats.default);

//  Utilities
const concat = (a, b) => uniq(a.concat(b));

const mergeTransactions = (oldResp, newResp, form) =>
  ({ ...newResp, form, transactions: concat(oldResp.transactions, newResp.transactions) });


//  API
class API {
  constructor() {
    this.web = new WebClient();
    this.host = NETBANK_HOST;
  }

  async getLogonForm() {
    const resp = await this.web.get(this.getUrl(PATH.LOGON));
    this.refreshBase(resp);

    const { form } = await parser.parseForm(resp);
    return form;
  }

  async postLogonForm(form, username, password) {
    const resp = await this.web.post({
      url: this.getUrl(PATH.LOGON),
      form: {
        //  The basic form
        ...form,
        //  Fill the credential
        txtMyClientNumber$field: username,
        txtMyPassword$field: password,
        chkRemember$field: 'on',
        //  and make JS detector happy
        JS: 'E',
      },
    });
    this.refreshBase(resp);
    return parser.parseHomePage(resp);
  }

  async logon(username, password) {
    this.credentials = { username, password };
    //  retrieve the logon page
    const form = await this.getLogonForm();
    return this.postLogonForm(form, username, password);
  }

  async getTransactionPage(link) {
    const resp = await this.web.get(this.getUrl(link));
    this.refreshBase(resp);
    return parser.parseTransactionPage(resp);
  }

  //  Get transaction history data for given time period.
  //
  //  * `from`: Default download begin at 6 years ago. FYI, I tried 8 years
  //    without getting any error message, however, keep in mind that bank
  //    usually only stored 2 years transactions history data.
  //  * `to`: Default value is today.
  async getTransactionHistory(account, from = SixYearsAgo, to = Today) {
    debug(`getTransactionHistory(account: ${account.name} [${account.number}] => ${account.available})`);
    //  retrieve post form and key for the given account

    const respTP = await this.getTransactionPage(account.link);
    const acc = { ...account, link: Url.parse(respTP.url).path };

    //  Get Account Key
    if (respTP.accounts !== null) {
      const accFound = respTP.accounts.find(a => a.number === account.number);
      if (!accFound) {
        throw new Error(`TransactionPage doesn't contain given account. ${JSON.stringify(respTP.accounts)}`);
      }
      acc.key = accFound.key;
    }

    //  if the transaction section is lazy loading, we need do a panel update
    //  first, before the real search.
    if (!respTP.form.ctl00$BodyPlaceHolder$radioSwitchSearchType$field$) {
      const respLazy = await this.lazyLoading(respTP, acc);
      const respTBD = await this.getTransactionsByDate(respLazy, acc, from, to);
      return { ...respTBD, pendings: respTP.pendings };
    }

    const respTBD = await this.getTransactionsByDate(respTP, acc, from, to);
    debug(`getTransactionHistory(): Total received ${respTBD.transactions.length} transactions.`);
    //  attach pending
    return { ...respTBD, pendings: respTP.pendings };
  }

  //  Web API

  //  If the search panel is lazy loading, not only the transactions data is not in
  //  the page, the search page widget is not ready as well. So, search request will
  //  fail. To workaround such problem, we send an update panel partial callback
  //  first,let server side prepared the search panel and download transaction.
  //  Then, do the real search using the information from the parital callback result.
  async lazyLoading(response, account) {
    debug(`lazyLoading(account: ${account.name} [${account.number}] => ${account.available}))`);
    let resp = this.web
      .post({
        url: this.getUrl(account.link),
        form: {
          ...response.form,
          //  Send partial request
          ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjaxh',
          __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
          __EVENTARGUMENT: 'doPostBackApiCall|LoadRecentTransactions|false',
        },
        partial: true,
      });
    resp = await parser.parseViewState(resp);
    try {
      resp = await parser.parseForm(resp);
    } catch (e) {
      debug(`lazyLoading(): ${JSON.stringify(e)}`);
    }

    return { ...resp, form: { ...response.form, ...resp.form } };
  }

  async getMoreTransactionsPage(link, form) {
    const newForm = {
      ...form,
      // fill the form
      ctl00$ctl00: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax|ctl00$BodyPlaceHolder$UpdatePanelForAjax',
      __EVENTTARGET: 'ctl00$BodyPlaceHolder$UpdatePanelForAjax',
      __EVENTARGUMENT: 'doPostBackApiCall|LoadTransactions|{"ClearCache":"false","IsSorted":false,"IsAdvancedSearch":true,"IsMonthSearch":false}',
    };

    const resp = await this.web.post({ url: this.getUrl(link), form: newForm, partial: true });
    this.refreshBase(resp);
    return parser.parseTransactions(resp);
  }

  async getMoreTransactions(response, account) {
    debug(`getMoreTransactions(account: ${account.name} [${account.number}] => ${account.available})`);
    debug(JSON.stringify(account));
    const resp = await this.getMoreTransactionsPage(account.link, response.form);

    debug(`getMoreTransactions(): more = ${resp.more}, limit = ${resp.limit}`);
    if (!resp.more || resp.limit) {
      //  There is no more transactions or reached the limit.
      return resp;
    }

    //  load more
    try {
      const respMore = await this.getMoreTransactions(
        { ...resp, form: response.form },
        { ...account, link: Url.parse(resp.url).path },
      );
      return mergeTransactions(resp, respMore, response.form);
    } catch (e) {
      debug(`getMoreTransactions(): 'load more error,', ${e}`);
      return resp;
    }
  }


  async postHistoryByDatePage(link, form, from, to) {
    const formDate = {
      ...form,
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
    };

    const resp = await this.web.post({ url: this.getUrl(link), form: formDate, partial: true });
    this.refreshBase(resp);
    return parser.parseTransactions(resp);
  }

  async getTransactionsByDate(response, account, from, to) {
    debug(`getTransactionsByDate(account: ${account.name} [${account.number}] => ${
      account.available
    }, from: ${from}, to: ${to})`);

    const respBD = await this.postHistoryByDatePage(account.link, response.form, from, to);
    if (!respBD.more || respBD.limit) {
      //  there is no more transactions or reached the limit.
      return respBD;
    }

    //  There are more transactions available.
    try {
      const respMore = await this.getMoreTransactions(
        { ...respBD, form: respBD.form },
        { ...account, link: Url.parse(respBD.url).path },
      );
      const respMoreMerged = mergeTransactions(respBD, respMore, respBD.form);
      debug(`getTransactionsByDate(): getMoreTransactions(): More => ${respMoreMerged.more}, Limit => ${respMoreMerged.limit}`);
      if (respMoreMerged.more && respMoreMerged.limit) {
        //  if there are more transactions, however it reaches limit
        //  we need to send another search request to overcome the limit.
        throw Object.assign(new Error('Reach transations limit'), { response: respMoreMerged });
      }
      return respMoreMerged;
    } catch (error) {
      //  an error happend during load more, it means that it may have more,
      //  however, some restriction made it stopped, so we call it again,
      //  but this time, we use the eariliest date from the transactions
      //  we retrieved so far as the toDate, so it might workaround this
      //  problem.

      debug(error);

      //  if there is a `response` object attached to `error` object, that means
      //  it's just reach the limit, and contains transations. Otherwise, it don't
      //  have the transactions, a real error, then use previous `resp` instead.
      const r = error.response || respBD;
      //  find the earliest date as new 'to' date.
      const earliest = Math.min(...(r.transactions.map(t => t.timestamp)));
      const newTo = moment(earliest).format(moment.formats.default);

      // Call self again
      debug(`Call getTransactionsByDate() again with new 'to' date (${to} => ${newTo})`);
      try {
        const respBD2 = await this.getTransactionsByDate(
          { ...r, form: respBD.form },
          { ...account, link: Url.parse(r.url).path },
          from,
          newTo,
        );
        //  concat more transactions
        return mergeTransactions(r, respBD2, respBD.form);
      } catch (err) {
        //  cannot call it again, but we got some transactions at least,
        //  so, just call it a success.
        debug(err);
        debug('getTransactionsByDate(): failed to call self again to load more');
        return { ...r, form: respBD.form };
      }
    }
  }

  //  Utilities
  //  Return `${this.base}+${path}`
  getUrl(path) {
    return Url.resolve(this.host, path);
  }

  //  Change the BASE link if it's been redirected.
  refreshBase(resp) {
    const oldLink = Url.parse(this.host);
    const newLink = Url.parse(resp.url);

    if (oldLink.host !== newLink.host) {
      debug(`refreshBase(${oldLink.host} => ${newLink.host}`);
      oldLink.host = newLink.host;
      this.host = Url.format(oldLink);
    }
    return resp;
  }
}

//  Exports
module.exports = API;
