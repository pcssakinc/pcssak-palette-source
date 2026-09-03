# PCSSAK Palette — source edition

[한국어](README.ko.md) · [Build](docs/BUILDING.md) · [Contribute](CONTRIBUTING.md) · [Security](SECURITY.md)

Palette helps people create color palettes and inspect text/background contrast. A central goal is to support people with color-vision differences in making their own design decisions, with feedback from the people who use it.

## Start here — try it, ask, or help

**[Meet the maker and join the conversation](https://github.com/pcssakinc/pcssak-palette-source/discussions/1)** — tell us one task you want to make easier. You do not need to write code; any language is welcome.

| What you want to do | Where to start |
| --- | --- |
| Use the existing Windows app | [Official downloads and version notes](https://github.com/pcssakinc/pcssak-palette-releases/releases) |
| Ask a question or share an experience/idea | [Community conversations](https://github.com/pcssakinc/pcssak-palette-source/discussions) |
| Help with a small source or documentation task | [Beginner-friendly tasks](https://github.com/pcssakinc/pcssak-palette-source/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22) · [Contribution guide](CONTRIBUTING.md) |
| Report a vulnerability | [Private security reporting](SECURITY.md), not a public comment |

The existing installer and this source snapshot are different releases. For a reproducible bug, include the app version in [installer reports](https://github.com/pcssakinc/pcssak-palette-releases/issues), or the source commit in [source reports](https://github.com/pcssakinc/pcssak-palette-source/issues). A diagnosis, real name or private image is not needed. Remove personal information before sharing.

## What is included

This source snapshot includes the full Palette implementation, including color-vision support and code originally intended for paid or Pro features. Private keys, personal information, other products and internal operational records are not part of the publication. Source publication does not make an unfinished feature complete: the historical internal-pro switch remains an explicit experimental opt-in. It is not a purchase or an entitlement to official paid services.

PCSSAK is maintained by one developer using AI assistance. The maintainer is responsible for review and release decisions. The project uses third-party open-source components and published color research; it does not claim that every line or algorithm was invented by PCSSAK.

## Scope and limitations

- Windows desktop is the target. x64 and x86 application builds require their own testing; this is not a claim that every Windows 10/11 edition, update or installation path has passed.
- Color-vision previews are approximations, not medical diagnosis, a prediction of an individual's vision, or accessibility certification. Use text, icons and other non-color cues, and test real designs with users.
- Source builds use the separate application identifier com.pcssak.palette.source and do not join the official updater channel by default. Do not use them to overwrite an existing installation or its data.
- Test results apply only to the named source snapshot and tested environment, not to all future changes or downloaded binaries.

## Source, downloads and release control

This repository contains selected, validated Palette source snapshots. Maintainers review changes from the internal working repository before publication; internal commits are not automatically public. Public pull requests are reviewed separately and are not automatically copied into official releases.

Existing installers are at [Palette Releases](https://github.com/pcssakinc/pcssak-palette-releases/releases). Publishing this source does not by itself relicense historical v0.1.8 binaries or change their files, notices or update channel. Follow the licence and source information attached to the specific copy you receive.

Self-built installers may be unsigned. An unsigned file is not thereby proven safe: verify its origin and hash where supplied. Do not disable SmartScreen, Defender or other security controls to install it.

## Licence and participation

The published source snapshot's PCSSAK-authored contributions are under GPL-3.0-only, subject to the scope in [COPYRIGHT.md](COPYRIGHT.md) and the accompanying [LICENSE](LICENSE). Third-party copyrights and licences remain in force; see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

Free and paid redistribution are permitted under the applicable licence conditions. No mandatory royalty, advance sales notification or contribution-back pull request is required. Contact and sponsorship are voluntary. Ordinary palette/design outputs do not acquire a PCSSAK attribution requirement merely from using the app.

Questions and experiences in any language are welcome in [community conversations](https://github.com/pcssakinc/pcssak-palette-source/discussions). Use [source issues](https://github.com/pcssakinc/pcssak-palette-source/issues) for reproducible source problems and agreed tasks, and [Palette release issues](https://github.com/pcssakinc/pcssak-palette-releases/issues) for existing installers. Please read the [privacy notice](docs/PRIVACY.md) and use the private route in [SECURITY.md](SECURITY.md) for vulnerabilities.
