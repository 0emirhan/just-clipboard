/* Tiny assertion helper. Usage: import { test, assertEq, summary } from './assert.js'; */

const state = { passed: 0, failed: 0 };

export function test(name, fn) {
    try {
        fn();
        state.passed++;
        print(`  ✓ ${name}`);
    } catch (e) {
        state.failed++;
        print(`  ✗ ${name}`);
        print(`    ${e.message}`);
    }
}

export function assertEq(actual, expected, label = 'assertEq') {
    if (actual !== expected)
        throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function assertTrue(cond, label = 'assertTrue') {
    if (!cond) throw new Error(`${label}: condition was falsy`);
}

export function summary() {
    print(`\n${state.passed}/${state.passed + state.failed} passed`);
    return state.failed === 0 ? 0 : 1;
}
