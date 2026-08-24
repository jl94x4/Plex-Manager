import assert from 'node:assert/strict';
import test from 'node:test';
import { collectBulkWatchUrls } from './watcher.js';

test('collectBulkWatchUrls prefers pasted urls and skips comments', () => {
    const urls = collectBulkWatchUrls({
        text: [
            '# ignore',
            '// also ignore',
            'https://mediux.pro/sets/111',
            'https://theposterdb.com/set/222',
            'not-a-url',
            '',
        ].join('\n'),
    });
    assert.deepEqual(urls, [
        'https://mediux.pro/sets/111',
        'https://theposterdb.com/set/222',
    ]);
});

test('collectBulkWatchUrls uses input.urls before CLI outcomes', () => {
    const urls = collectBulkWatchUrls(
        { urls: ['https://mediux.pro/sets/1', 'https://mediux.pro/sets/2'] },
        { outcomes: [{ url: 'https://mediux.pro/sets/9' }] },
    );
    assert.deepEqual(urls, [
        'https://mediux.pro/sets/1',
        'https://mediux.pro/sets/2',
    ]);
});

test('collectBulkWatchUrls falls back to bulk outcomes when the list is empty', () => {
    const urls = collectBulkWatchUrls(
        {},
        {
            outcomes: [
                { url: 'https://theposterdb.com/set/10' },
                { url: 'https://theposterdb.com/set/10' },
                { url: '' },
            ],
        },
    );
    assert.deepEqual(urls, ['https://theposterdb.com/set/10']);
});
