import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Brand Scrub & Integrity Invariant Suite', () => {
  it('1. Confirms brand name workBYLiNE is used across user-facing pages and components', () => {
    const webDir = path.resolve(__dirname, '../../');
    const authPagePath = path.join(webDir, 'app/auth/page.jsx');
    const authContent = fs.readFileSync(authPagePath, 'utf8');

    expect(authContent).toContain('work<span className="text-[#00D604] font-bold">BYLiNE</span>');
    expect(authContent).not.toContain('CareerTW');
    expect(authContent).not.toContain('CareerTWiN');
  });

  it('2. Confirms SMTP and evaluation service headers use workBYLiNE', () => {
    const webDir = path.resolve(__dirname, '../../');
    const smtpPath = path.join(webDir, 'lib/smtp.js');
    const smtpContent = fs.readFileSync(smtpPath, 'utf8');

    expect(smtpContent).toContain("fromName = 'workBYLiNE Team'");
    expect(smtpContent).not.toContain("fromName = 'CareerTWiN Team'");
  });

  it('3. Confirms ProductGovernanceNotice enforces workBYLiNE copy', () => {
    const webDir = path.resolve(__dirname, '../../');
    const govNoticePath = path.join(webDir, 'components/packet/ProductGovernanceNotice.jsx');
    const govNoticeContent = fs.readFileSync(govNoticePath, 'utf8');

    expect(govNoticeContent).toContain('workBYLiNE supports evidence review and interview prioritization');
    expect(govNoticeContent).not.toContain('CareerTWiN supports');
  });
});

