import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const subject = process.argv[2];
const body = process.argv[3] || '';
if (!subject) {
    console.error('Usage: node scripts/make-clean-commit.mjs "subject" "optional body"');
    process.exit(1);
}

const message = body ? `${subject}\n\n${body}` : subject;
const dir = mkdtempSync(join(tmpdir(), 'git-msg-'));
const msgPath = join(dir, 'msg.txt');
writeFileSync(msgPath, message, 'utf8');

try {
    const tree = execSync('git write-tree').toString().trim();
    const parent = execSync('git rev-parse HEAD').toString().trim();
    const newCommit = execSync(`git commit-tree ${tree} -p ${parent} -F "${msgPath}"`).toString().trim();
    execSync(`git update-ref HEAD ${newCommit}`);
    execSync('git reset HEAD');
    process.stdout.write(execSync('git log -1 --format=full').toString());
} finally {
    rmSync(dir, { recursive: true, force: true });
}
