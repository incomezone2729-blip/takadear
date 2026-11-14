import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

test('Firestore rules enforce default-deny safety net and rules_version 2', () => {
  assert.match(rulesContent, /rules_version\s*=\s*'2';/);
  assert.match(rulesContent, /match\s+\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/);
});

test('Firestore rules enforce exclusive verified admin email and no blanket reads', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rulesContent, /function isAdmin\(\)\s*\{\s*return isVerifiedAdmin\(\)\s*&&\s*request\.auth\.token\.email\s*==\s*'incomezone2729@gmail\.com';/);
  assert.doesNotMatch(rulesContent, /ahtaskpay@gmail\.com/);
  assert.doesNotMatch(rulesContent, /allow\s+(read|get|list)\s*:\s*if\s+isSignedIn\(\)\s*;/);
});

test('Every blueprint collection has an explicit match block in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore);
  const requiredSegments = [
    'match /users/{userId}',
    'match /private/{docId}',
    'match /transactions/{txId}',
    'match /spins/{spinId}',
    'match /withdrawals/{withdrawalId}',
    'match /referralCodes/{refCode}',
    'match /referralClaims/{claimId}',
    'match /admins/{adminId}',
    'match /taskSettings/{settingId}',
    'match /accountSubmissions/{submissionId}',
    'match /supportThreads/{userId}',
    'match /messages/{messageId}',
    'match /test/{docId}',
  ];
  assert.ok(paths.length >= requiredSegments.length);
  for (const seg of requiredSegments) {
    assert.ok(rulesContent.includes(seg), `Missing rule block for ${seg}`);
  }
});

test('Dirty Dozen security invariants and tightened reward bounds are guarded in firestore.rules', () => {
  // 1. Self-privilege escalation & self-unsuspend blocked
  assert.match(rulesContent, /incoming\(\)\.role\s*==\s*'user'/);
  assert.match(rulesContent, /function isNotSuspendedExisting\(\)/);
  // 2. Shadow updates blocked via hasOnly
  assert.match(rulesContent, /affectedKeys\(\)\.hasOnly\(/);
  // 3. Email spoofing blocked via isVerifiedAdmin() in isAdmin()
  assert.match(rulesContent, /function isAdmin\(\)\s*\{\s*return isVerifiedAdmin\(\)/);
  // 4. ID poisoning blocked via isValidId
  assert.match(rulesContent, /function isValidId\(id\)/);
  // 5. Timestamp forgery blocked via request.time
  assert.match(rulesContent, /incoming\(\)\.createdAt\s*==\s*request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
  // 6. Terminal state locking on withdrawals and account submissions
  assert.match(rulesContent, /existing\(\)\.status\s*==\s*'প্রসেসিং'/);
  assert.match(rulesContent, /existing\(\)\.status\s*==\s*'পেন্ডিং'/);
  // 7. Tightened referral (2), signup (0), and spin (<=2) limits
  assert.match(rulesContent, /incoming\(\)\.amount\s*==\s*2/);
  assert.match(rulesContent, /data\.amount\s*<=\s*2/);
  assert.match(rulesContent, /incoming\(\)\.balance\s*==\s*0/);
  assert.doesNotMatch(rulesContent, /incoming\(\)\.balance\s*==\s*4/);
  // 8. Admin-controlled regular tasks, referral settings, and sell enablement enforcement
  assert.match(rulesContent, /function isValidRegularTaskSettings\(data\)/);
  assert.match(rulesContent, /function isValidReferralSettings\(data\)/);
  assert.match(rulesContent, /function isFriendReferralBonusAction\(\)/);
  assert.match(rulesContent, /settingId\s*==\s*'regular_tasks'/);
  assert.match(rulesContent, /settingId\s*==\s*'referral_settings'/);
  assert.match(rulesContent, /gmailEnabled\s*==\s*true/);
  assert.match(rulesContent, /facebookEnabled\s*==\s*true/);
  assert.match(rulesContent, /data\.dailyAds\s*<=\s*200/);
  assert.match(rulesContent, /existing\(\)\.balance\s*\+\s*500/);
  // 9. Strict wallet delta parity & work-counter causality (no free balance shifts)
  assert.match(rulesContent, /function sameMoneyDelta\(aNew, aOld, bNew, bOld\)/);
  assert.match(rulesContent, /function isDailyCounterRolloverAction\(\)/);
  assert.match(rulesContent, /function isDailyCheckinAction\(\)/);
  assert.match(rulesContent, /function isTaskEarningAction\(\)/);
  assert.match(rulesContent, /function isSpinEarningAction\(\)/);
  assert.match(rulesContent, /getAfter\(\/databases\/\$\(database\)\/documents\/referralClaims\/\$\(request\.auth\.uid\)\)/);
  assert.match(rulesContent, /\(existing\(\)\.balance - incoming\(\)\.balance\) <= 100000/);
  // 10. Immutable transactions, spins, and support messages
  assert.match(rulesContent, /allow update, delete:\s*if false;/);
});
