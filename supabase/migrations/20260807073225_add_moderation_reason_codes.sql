alter type "ModerationReasonCode"
  add value if not exists 'threatOrPersonalData';
alter type "ModerationReasonCode"
  add value if not exists 'unofficialThirdPartyProfile';
alter type "ModerationReasonCode"
  add value if not exists 'politicalReligiousPromotion';
