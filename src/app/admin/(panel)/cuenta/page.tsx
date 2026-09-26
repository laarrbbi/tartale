import QRCode from 'qrcode';

import { ChangePasswordForm, TwoFactorCard, type TwoFactorView } from '@/components/admin/account-forms';
import { BRAND } from '@/lib/brand';
import { requireSession } from '@/server/auth/guard';
import { getTotp } from '@/server/repositories/users';
import { otpauthUrl } from '@/server/security/totp';

export default async function AccountPage() {
  const session = await requireSession({ allowPasswordChange: true });
  const forced = session.user.mustChangePassword;
  const totp = await getTotp(session.user.id);

  let view: TwoFactorView = { kind: 'off' };
  if (totp?.enabled) view = { kind: 'on' };
  else if (totp?.secret) {
    const qrDataUri = await QRCode.toDataURL(otpauthUrl(totp.secret, session.user.email, BRAND.name), { margin: 1, width: 400 });
    view = { kind: 'pending', qrDataUri, secret: totp.secret };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="type-display">Tu cuenta</h1>
        <p className="type-body mt-1 text-ink-muted">
          {session.user.displayName} · {session.user.email}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <ChangePasswordForm csrfToken={session.csrfToken} forced={forced} />
        {!forced ? <TwoFactorCard view={view} csrfToken={session.csrfToken} /> : null}
      </div>
    </div>
  );
}
