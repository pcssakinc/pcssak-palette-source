# Contributing to Palette

[한국어](CONTRIBUTING.ko.md)

We welcome bug reports, usability experiences, translations, tests, documentation and focused code proposals. First-hand color-vision experiences are valuable; a diagnosis, real name or private image is not required. Questions in any language are welcome, and translation assistance may be used.

## Choose a place to start

- New here? Read the [welcome and reply with one experience](https://github.com/pcssakinc/pcssak-palette-source/discussions/1). Questions and early ideas belong in [Discussions](https://github.com/pcssakinc/pcssak-palette-source/discussions); coding is optional.
- Reproducible source-build bugs and agreed work belong in [source issues](https://github.com/pcssakinc/pcssak-palette-source/issues). See [beginner-friendly tasks](https://github.com/pcssakinc/pcssak-palette-source/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22).
- Existing installer problems belong in [Palette release issues](https://github.com/pcssakinc/pcssak-palette-releases/issues). Say whether you used an installer or a source build, and give its app version or source commit. They are not interchangeable releases.
- Vulnerabilities must use the [private security route](SECURITY.md), not public conversations or issues.

## Start small

1. Check existing discussions and issues in the matching place above. Explain the task you tried, the expected result and what happened. For an open task, comment with the small part you would like to help with before starting, to avoid duplicate effort.
2. For substantial work, discuss the scope before spending time. A suggestion is not a promise of implementation, payment or merge.
3. Submit source changes through a fork and pull request in this repository. Describe the change, tests, known limitations and any third-party material or AI assistance.
4. Prefer synthetic examples. Remove names, private paths, credentials, customer content and image metadata from reports.

Run the relevant checks in [BUILDING.md](docs/BUILDING.md). State which checks you actually ran and distinguish them from earlier release results. Do not access unrelated files, test another person's installation, or disable security controls.

## Rights and compensation

You retain copyright in your contributions. Submit only material you have the right to share. Code and documentation intended for inclusion must be available under this project's applicable licence; original third-party notices and file-specific licence requirements must remain intact. A GPL-only project notice does not overwrite an upstream MPL file's requirements.

Ordinary contributions are voluntary and unpaid unless a separate compensation agreement is made in advance. A submission does not create equity, revenue share, employment, copyright assignment or an obligation to pay. No separate right to relicense a contributor's work outside its applicable licence is implied. If different terms are needed, discuss them before submitting the work.

AI-assisted contributions are welcome when a person reviews them, explains their purpose and checks tests and provenance. State material AI assistance and remaining uncertainty. Do not upload other people's confidential code or data to an AI service.

## Review and releases

The maintainer controls the official branch and release decisions. Public contributions may be reviewed and integrated into the internal working tree, then included in a separately validated public snapshot. This is not an automatic mirror, and neither a response time nor acceptance is guaranteed.

Untrusted pull-request checks must run without release credentials, signing keys or privileged deployment access. A pull request never authorizes a release or a change to the official update channel.

For vulnerabilities, use [SECURITY.md](SECURITY.md), not a public issue. Follow the [community rules](CODE_OF_CONDUCT.md).
