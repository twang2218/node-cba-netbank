/* eslint-disable no-undef */

// Dependencies
const web = require('../src/web');
const nock = require('nock');

//  create a simple parser to use
function parser(resp) {
  expect(resp.body).toEqual('Hello from Google!');
  return Object.assign(resp, { data: resp.body.split(' ') });
}

//  create a simple consumer
function processor(resp) {
  expect(resp.data).toEqual(['Hello', 'from', 'Google!']);
  return resp;
}

describe('web.js', () => {
  describe('- get()', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => nock.cleanAll());

    test('should get a page, run parser, call back', (done) => {
      const commbank = nock('https://www.my.commbank.com.au').get('/').reply(200, 'Hello from Google!');

      web.get('https://www.my.commbank.com.au/').then(parser).then(processor).then(() => {
        commbank.done();
        done();
      });
    });

    test('should raise error if request failed.', (done) => {
      const commbank = nock('https://www.my.commbank.com.au').get('/').replyWithError('something awful happened');

      web.get('https://www.my.commbank.com.au/').then(parser).then(processor).catch((error) => {
        expect(error).not.toBeNull();
        commbank.done();
        done();
      });
    });
  });

  describe('- post()', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => nock.cleanAll());

    test('should post a form, parse the page, and call back', (done) => {
      const commbank = nock('https://www.my.commbank.com.au')
        .post('/users', (body) => {
          expect(body.username).toEqual('johndoe');
          expect(body.password).toEqual('123456');
          return body.username === 'johndoe' && body.password === '123456';
        })
        .reply(200, 'Hello from Google!');

      web
        .post({
          url: 'https://www.my.commbank.com.au/users',
          form: {
            username: 'johndoe',
            password: '123456',
          },
        })
        .then(parser)
        .then(processor)
        .then(() => {
          commbank.done();
          done();
        });
    });

    test('should raise error if request failed.', (done) => {
      const commbank = nock('https://www.my.commbank.com.au')
        .post('/users', (body) => {
          expect(body.username).toEqual('johndoe');
          expect(body.password).toEqual('123456');
          return body.username === 'johndoe' && body.password === '123456';
        })
        .replyWithError('something awful happened');

      web
        .post({
          url: 'https://www.my.commbank.com.au/users',
          form: {
            username: 'johndoe',
            password: '123456',
          },
        })
        .then(parser)
        .then(processor)
        .catch((error) => {
          expect(error).not.toBeNull();
          commbank.done();
          done();
        });
    });
  });

  describe('- real world access', () => {
    beforeEach(() => nock.enableNetConnect());
    test('www.google.com.au', (done) => {
      web.get('https://www.google.com.au').then((resp) => {
        expect(resp.body.indexOf('<title>Google</title>')).toBeGreaterThan(-1);
        done();
      });
    });
  });
});
