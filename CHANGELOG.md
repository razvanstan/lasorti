# Changelog

Versions follow [Semantic Versioning](https://semver.org).

## [1.1.0] - 2026-11-25

Three quick tools, next to the tombola and the giveaway. They need no account and no backend, and the lists stay in the browser.

### Added

- **Random teams** ([/echipe/](https://lasorti.ro/echipe/)): splits a list of people into teams.
- **Random order** ([/ordine/](https://lasorti.ro/ordine/)): puts a list in a random order.
- **Wheel of options** ([/roata/](https://lasorti.ro/roata/)): up to 40 options, with a pointer that catches on the pins; the chosen option can be taken off the wheel before the next spin.
- Repeated draws of the same list on the same day are numbered.
- Like the other draws, results are chosen with the browser's cryptographic generator and saved before any animation.

## [1.0.0] - 2026-11-24

First public release of [la sorți](https://lasorti.ro): a free, ad-free tool for drawing winners live, in Romanian.

### Draws

- **Tombola:** several prizes with sponsors and rarities; participants pasted from Excel, Google Sheets or Forms, with duplicates removed by email, phone, name or any column.
- **Giveaway:** winners and reserves from copied Instagram comments or a list of participants, with rules for tags, keyword, excluded accounts and chances.
- Demo draws for both, on fictional data.

### On stage

- Countdown, suspense, confetti, sounds, full screen and keyboard control.
- Custom title, subtitle, logo and accent colour; light and dark mode.
- Redraws for absent winners, recorded in the report.
- Draws resume after a reload, and a winner already chosen cannot be changed by reloading.

### Results

- Spreadsheet, CSV, printable report, exact participant list, a picture for social media and a `.json` configuration.

### Fairness and privacy

- Winners chosen with the browser's cryptographic generator, without modulo bias, and saved before the animation starts.
- SHA-256 fingerprint of the participant list.
- No account, no backend, no cookies: participants' data stays in the browser. Only cookie-free, self-hosted counts of page views and draws.

[1.1.0]: https://github.com/razvanstan/lasorti/releases/tag/v1.1.0
[1.0.0]: https://github.com/razvanstan/lasorti/releases/tag/v1.0.0
