import { useStatus } from '@/hooks/use-status'
import { ProfileSecurityCard } from '@/features/profile/components/profile-security-card'
import { ProfileSettingsCard } from '@/features/profile/components/profile-settings-card'
import { LanguagePreferencesCard } from '@/features/profile/components/language-preferences-card'
import { CheckinCalendarCard } from '@/features/profile/components/checkin-calendar-card'
import { PasskeyCard } from '@/features/profile/components/passkey-card'
import { TwoFACard } from '@/features/profile/components/two-fa-card'
import { useProfile } from '@/features/profile/hooks'

export function PortalProfile() {
  const { profile, loading, refreshProfile } = useProfile()
  const { status } = useStatus()

  const checkinEnabled = status?.checkin_enabled === true
  const turnstileEnabled = !!(status?.turnstile_check && status?.turnstile_site_key)
  const turnstileSiteKey = status?.turnstile_site_key || ''

  return (
    <div className="portal-settings space-y-5">
      <ProfileSettingsCard
        profile={profile}
        loading={loading}
        onProfileUpdate={refreshProfile}
      />
      <LanguagePreferencesCard
        profile={profile}
        onProfileUpdate={refreshProfile}
      />
      <ProfileSecurityCard profile={profile} loading={loading} />
      <PasskeyCard loading={loading} />
      <TwoFACard loading={loading} />
      {checkinEnabled && (
        <CheckinCalendarCard
          checkinEnabled={checkinEnabled}
          turnstileEnabled={turnstileEnabled}
          turnstileSiteKey={turnstileSiteKey}
        />
      )}
    </div>
  )
}
