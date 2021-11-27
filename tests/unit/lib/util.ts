import Test from 'intern/lib/Test';
import * as util from '../../../src/lib/util';

declare let __cov_abcdef: number;
declare let a: any;

registerSuite('lib/leadfoot/util', {
  '.sleep'() {
    const startTime = Date.now();
    return util.sleep(250).then(function () {
      assert.isAtLeast(Date.now() - startTime, 250);
    });
  },

  '.sleep canceler'(this: Test) {
    const startTime = Date.now();
    const sleep = util.sleep(5000);
    const dfd = this.async();
    sleep.cancel();
    sleep.finally(function () {
      assert.isBelow(Date.now() - startTime, 1000);
      dfd.resolve();
    });
  },

  '.forCommand'() {
    const commandFn: any = util.forCommand(function () {}, {
      createsContext: false,
      usesElement: true,
    });
    assert.isFalse(commandFn.createsContext);
    assert.isTrue(commandFn.usesElement);
  },

  '.toExecuteString string'() {
    const script = util.toExecuteString('return a;');
    assert.strictEqual(script, 'return a;');
  },

  '.toExecuteString function'() {
    const script = util.toExecuteString(function () {
      __cov_abcdef = __cov_abcdef + 1;
      return a;
    });
    assert.match(
      script,
      /^return \(function \(\) \{\s*return a;\s*\}\)\.apply\(this, arguments\);$/
    );
  },
});
