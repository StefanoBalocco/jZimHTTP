import test from 'ava';
import { Semaphore } from '../../dist/semaphore.js';
test('acquire succeeds immediately when slots available', async (t) => {
    const sem = new Semaphore(2);
    const acquired = await sem.acquire();
    t.true(acquired);
});
test('acquire without wait returns false when no slots', async (t) => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const acquired = await sem.acquire(false);
    t.false(acquired);
});
test('release frees a slot for waiting acquirer', async (t) => {
    const sem = new Semaphore(1);
    await sem.acquire();
    let resolved = false;
    const waitPromise = sem.acquire().then((result) => {
        resolved = true;
        return result;
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    t.false(resolved);
    sem.release();
    const result = await waitPromise;
    t.true(result);
    t.true(resolved);
});
test('multiple slots allow concurrent acquires up to limit', async (t) => {
    const sem = new Semaphore(3);
    t.true(await sem.acquire());
    t.true(await sem.acquire());
    t.true(await sem.acquire());
    t.false(await sem.acquire(false));
});
test('default capacity is 1', async (t) => {
    const sem = new Semaphore();
    t.true(await sem.acquire());
    t.false(await sem.acquire(false));
});
test('queue order is FIFO', async (t) => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order = [];
    const p1 = sem.acquire().then(() => { order.push(1); });
    const p2 = sem.acquire().then(() => { order.push(2); });
    sem.release();
    await p1;
    sem.release();
    await p2;
    t.deepEqual(order, [1, 2]);
});
test('release without prior acquire is a no-op', t => {
    const sem = new Semaphore(2);
    sem.release();
    t.pass();
});
test('availableSlots reflects current state', async (t) => {
    const sem = new Semaphore(3);
    t.is(sem.availableSlots, 3);
    await sem.acquire();
    t.is(sem.availableSlots, 2);
    await sem.acquire();
    t.is(sem.availableSlots, 1);
    sem.release();
    t.is(sem.availableSlots, 2);
});
