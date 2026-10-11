export const getSessionCookieName = (secure: boolean): string =>
  secure ? '__Host-comvivati-session' : 'comvivati_session';
