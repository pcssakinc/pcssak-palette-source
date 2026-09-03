use serde::Serialize;

use crate::{AppError, AppResult};

pub const FREE_LIBRARY_LIMIT: usize = 10;
pub const PRO_LIBRARY_LIMIT: usize = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)] // 기능 조합별 공개·내부 빌드에서는 두 변형 중 하나만 직접 구성됩니다.
pub enum LicenseTier {
    Free,
    LifetimePro,
}

impl LicenseTier {
    pub fn is_pro(self) -> bool {
        matches!(self, Self::LifetimePro)
    }
}

#[derive(Clone, Debug)]
pub struct EntitlementState {
    tier: LicenseTier,
    source: &'static str,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntitlementStatus {
    pub tier: LicenseTier,
    pub source: &'static str,
    pub distribution: &'static str,
    pub update_channel: &'static str,
}

impl EntitlementState {
    pub fn from_build() -> Self {
        #[cfg(feature = "internal-pro")]
        {
            Self {
                tier: LicenseTier::LifetimePro,
                source: "internal_pro",
            }
        }

        #[cfg(not(feature = "internal-pro"))]
        Self {
            tier: LicenseTier::Free,
            source: if cfg!(feature = "store") {
                "store_pending"
            } else {
                "public_free"
            },
        }
    }

    pub fn tier(&self) -> LicenseTier {
        self.tier
    }

    pub fn status(&self) -> EntitlementStatus {
        EntitlementStatus {
            tier: self.tier,
            source: self.source,
            distribution: distribution_channel(),
            update_channel: update_channel(),
        }
    }

    pub fn require_pro(&self) -> AppResult<()> {
        if self.tier.is_pro() {
            Ok(())
        } else {
            Err(AppError::new("proRequired"))
        }
    }
}

fn distribution_channel() -> &'static str {
    if cfg!(feature = "store") {
        "store"
    } else if cfg!(feature = "beta-updater") {
        "beta"
    } else if cfg!(debug_assertions) {
        "development"
    } else {
        "standalone"
    }
}

fn update_channel() -> &'static str {
    if cfg!(feature = "store") {
        "store"
    } else if cfg!(feature = "beta-updater") {
        "github"
    } else {
        "none"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_build_defaults_to_free() {
        let state = EntitlementState::from_build();
        if cfg!(feature = "internal-pro") {
            assert!(state.tier().is_pro());
        } else {
            assert_eq!(state.tier(), LicenseTier::Free);
            assert_eq!(state.require_pro().unwrap_err().code, "proRequired");
        }
    }

    #[test]
    fn status_keeps_distribution_and_license_separate() {
        let status = EntitlementState::from_build().status();
        assert!(!status.distribution.is_empty());
        assert!(!status.update_channel.is_empty());
        assert!(!status.source.is_empty());
    }
}
