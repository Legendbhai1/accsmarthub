/**
 * Registration-time email policy: only real, deliverable mailboxes.
 *
 * A marketplace where money moves through escrow cannot let people mint a
 * throwaway address per dispute. Temp-mail services are identified by their
 * domain — they are shared inboxes on a domain the operator owns, not a
 * mailbox the registrant owns — so the domain is the signal.
 *
 * The list lives here (client) for immediate feedback at the form, and is
 * duplicated server-side by `supabase/migrations/0007_email_and_store_policy.sql`,
 * which refuses the insert outright. The client check is a courtesy; the
 * database check is the one that cannot be bypassed with devtools.
 *
 * Public mailbox providers (gmail.com, outlook.com, icloud.com, …) are
 * deliberately absent: those are real domains with real mailboxes.
 */

const DISPOSABLE_DOMAINS: readonly string[] = [
  "0-mail.com", "0815.ru", "10mail.org", "10minemail.com", "10minutemail.co.za",
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "1secmail.com",
  "1secmail.net", "1secmail.org", "1zhuan.com", "20minutemail.com",
  "20minutemail.ru", "2prong.com", "30minutemail.com", "33mail.com",
  "4warding.com", "4warding.net", "4warding.org", "5ghgfhfghfgh.tk",
  "60minutemail.com", "675hosting.com", "675hosting.net", "675hosting.org",
  "6url.com", "7tags.com", "9ox.net", "a-bc.net", "afromail.com",
  "allthetronics.com", "alphard.com.br", "amilegit.com", "anonymbox.com",
  "antichef.com", "antireg.ru", "antispam.de", "baxomale.ht.cx",
  "binkmail.com", "bio-muesli.net", "bladesmail.net", "bloatbox.com",
  "bofthew.com", "boximail.com", "brefmail.com", "brennend.org",
  "broadbandninja.com", "bsnow.net", "buffemail.com", "bugmenot.com",
  "bumpymail.com", "burnermail.io", "bustmail.com", "buymoreplays.com",
  "byom.de", "c.nct97.com", "casualdx.com", "cbair.com", "cmail.com",
  "cmail.net", "cmail.org", "coldspotmail.com", "courrieltemporaire.com",
  "crapmail.org", "crazymailing.com", "cubiclink.com", "curryworld.de",
  "cust.in", "cx81.de", "d3vil.org", "dafthack.com", "dancetig.net",
  "deadaddress.com", "delikkt.de", "despam.com", "despammed.com",
  "devnullmail.com", "digitalsanctuary.com", "discard.email", "discardmail.com",
  "discardmail.de", "disposablemail.com", "dispostable.com", "dodgeit.com",
  "dodgit.com", "dodgeit.com", "dropmail.me", "dudmail.com", "dump-email.info",
  "dumpmail.de", "dumpyemail.com", "e4ward.com", "emailias.com",
  "emailinfive.com", "emaill.de", "emailmiser.com", "emailsensei.com",
  "emailtemporanea.net", "emailtemporario.com.br", "emailthe.net",
  "emailias.net", "emailigo.de", "etempmail.com", "fakeinbox.com",
  "fakemail.net", "fakemailz.com", "fightallspam.com", "filzmail.com",
  "firesurfer.de", "frapmail.com", "freemail.tokyo", "garliclife.com",
  "getmaildomain.com", "getonspam.com", "ghosttexter.de", "grr.la",
  "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "gustr.com", "harakirimail.com", "hot-mail.cf",
  "hot-mail.ga", "hotmail.kz", "hulapla.de", "hushmail.com", "mailinator.com",
  "mailinator.net", "mailinator.org", "mailinator2.com", "maildrop.cc",
  "mailcatch.com", "mailexpire.com", "mailforspam.com", "mailinator.gq",
  "mailnesia.com", "mailpoof.com", "mailsac.com", "mega.zik.dj",
  "meltmail.com", "mintemail.com", "minuteinbox.com", "moakt.com",
  "mohmal.com", "moncourrier.fr", "monemail.fr", "monmail.fr", "msa.minsmail.com",
  "mytemp.email", "mytrashmail.com", "neverbox.com", "no-spam.cf",
  "no-spam.ga", "no-spam.net", "no-spam.org", "nospam.ze.tc", "nospam4.us",
  "nowmymail.com", "nurfuerspam.de", "objectmail.com", "obobbo.com",
  "one-time.email", "oneoffemail.com", "onewaymail.com", "owlpic.com",
  "pokemail.net", "proxymail.eu", "punkass.com", "putthisinyourspamdatabase.com",
  "quickinbox.com", "rcpt.at", "reallymymail.com", "realtyalerts.ca",
  "recode.me", "recursor.net", "regbypass.com", "rejectmail.com",
  "rhyta.com", "rklips.com", "rmj.ru", "royal.net", "safetymail.info",
  "sandelf.de", "saynotospams.com", "scatmail.com", "skeefmail.com",
  "slaskowy.sh", "smellfear.com", "sneakmail.de", "sogetthis.com",
  "spam.la", "spam4.me", "spambob.com", "spambob.net", "spambob.org",
  "spambox.us", "spamcannon.com", "spamcannon.net", "spamcorptastic.com",
  "spamcowboy.com", "spamcowboy.net", "spamcowboy.org", "spamday.com",
  "spamex.com", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spamherelies.com", "spamhereplease.com", "spamimap.com", "spaminator.de",
  "spamkill.info", "spaml.com", "spammotel.com", "spamobox.com",
  "spamproject.com", "spamslicer.com", "spamspot.com", "spamthis.co.uk",
  "speed.1s.fr", "spoofmail.de", "superrito.com", "talkinator.com",
  "teewars.org", "teleworm.us", "temp-mail.io", "temp-mail.org",
  "temp-mail.ru", "tempail.com", "tempalias.com", "tempinbox.com",
  "tempmail.dev", "tempmail.plus", "tempmailo.com", "tempr.email",
  "temporary-mail.net", "temporaryemailaddress.com", "thanksnospam.info",
  "the-lastik.com", "throwawaymail.com", "tmail.ws", "trash-mail.com",
  "trashmail.com", "trashmail.de", "trashmail.me", "trashmail.net",
  "trashmail.org", "trashmailid.com", "tutye.com", "u1428065.isgmob.com",
  "veryrealemail.com", "viditag.com", "viewcastmedia.com", "mailsiphon.com",
  "wegwerfemail.de", "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "wetrainbayarea.com", "wh4i.org", "wegwerfemail.com", "wetrainbayarea.org",
  "whatiaas.com", "whatpaas.com", "womenswrongs.com", "xsph.ru",
  "yep.it", "yogamaven.com", "yopmail.com", "yopmail.fr", "yopmail.net",
  "youmailr.com", "zehnminuten.de", "zippymail.info", "zoznammail.sk",
  "0-mail.info", "boun.cr", "getonspam.com", "mailf5.com", "mt2015.com",
  "mailwithpass.com", "moonlightmail.com", "reversemail.com", "tafmail.com",
];

const DISPOSABLE = new Set(DISPOSABLE_DOMAINS);

/**
 * Longest first, so a subdomain of a disposable domain matches its most
 * specific entry and the scan is a single pass over a static array.
 */
const DISPOSABLE_SUFFIXES = [...DISPOSABLE].sort((a, b) => b.length - a.length);

/** The domain part of an address, lower-cased and trimmed. `null` if malformed. */
export function emailDomain(email: string): string | null {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1);
}

/**
 * Why this address must be refused at registration, or `null` when it is fine.
 *
 * Returns a sentence rather than a boolean so the caller can show the exact
 * reason instead of a generic "invalid email".
 */
export function disposableEmailReason(email: string): string | null {
  const domain = emailDomain(email);
  if (!domain) {
    return "Enter a full email address, like you@yourdomain.com.";
  }
  // A domain with no dot is never a deliverable mailbox — it is a typo or a
  // localhost name, and GoTrue would accept it anyway.
  if (!domain.includes(".")) {
    return `“${domain}” is not a real mail domain. Use the address of a mailbox you actually own.`;
  }
  const isDisposable =
    DISPOSABLE.has(domain) ||
    DISPOSABLE_SUFFIXES.some((d) => domain.endsWith(`.${d}`));
  if (isDisposable) {
    return `We do not accept temporary inboxes like ${domain}. Use a permanent email address — we send your sign-in and receipt links there.`;
  }
  return null;
}

/** True when the address belongs to a known disposable-mail domain. */
export function isDisposableEmail(email: string): boolean {
  return disposableEmailReason(email) !== null;
}
