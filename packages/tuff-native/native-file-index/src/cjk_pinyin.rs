use crate::cjk_pinyin_table::{CJK_PACKED_SYLLABLES, INITIALS, SYLLABLES};

const CJK_START: u32 = 0x4E00;
const CJK_END: u32 = 0x9FFF;

pub struct PinyinProjection {
    pub initials: String,
    pub full: String,
    pub spans: Vec<(u16, u16, u16, u16)>,
    pub has_cjk: bool,
}

pub type SyllableEntry = (u8, &'static str);

#[inline]
pub fn lookup_cjk_syllables(ch: char) -> Option<(SyllableEntry, Option<SyllableEntry>)> {
    let cp = ch as u32;
    if !(CJK_START..=CJK_END).contains(&cp) {
        return None;
    }
    let packed = CJK_PACKED_SYLLABLES[(cp - CJK_START) as usize];
    let p0 = (packed & 0x3FF) as usize;
    if p0 == 0 {
        return None;
    }
    let p1 = ((packed >> 10) & 0x3FF) as usize;
    let primary = (INITIALS[p0], SYLLABLES[p0]);
    let alt = if p1 != 0 && p1 != p0 {
        Some((INITIALS[p1], SYLLABLES[p1]))
    } else {
        None
    };
    Some((primary, alt))
}

#[inline]
pub fn contains_cjk(name: &str) -> bool {
    if name.is_ascii() {
        return false;
    }
    name.chars().any(|ch| lookup_cjk_syllables(ch).is_some())
}

pub fn build_pinyin_projection(name: &str) -> PinyinProjection {
    if !contains_cjk(name) {
        return PinyinProjection {
            initials: String::new(),
            full: String::new(),
            spans: Vec::new(),
            has_cjk: false,
        };
    }

    let char_est = name.chars().count();
    let mut primary_init = String::with_capacity(char_est);
    let mut alt_init: Option<String> = None;
    let mut primary_full = String::with_capacity(char_est * 4);
    let mut alt_full: Option<String> = None;
    let mut spans = Vec::with_capacity(char_est);
    let mut has_cjk = false;
    let mut utf16_pos: u16 = 0;

    for ch in name.chars() {
        let utf16_len = ch.len_utf16() as u16;
        if let Some(((init0, syl0), alt_opt)) = lookup_cjk_syllables(ch) {
            has_cjk = true;
            if let Some((init1, syl1)) = alt_opt {
                if init1 != init0 && alt_init.is_none() {
                    alt_init = Some(primary_init.clone());
                }
                if alt_full.is_none() {
                    alt_full = Some(primary_full.clone());
                }
                if let Some(ref mut ai) = alt_init
                    && init1 != 0
                {
                    ai.push(init1 as char);
                }
                if let Some(ref mut af) = alt_full {
                    af.push_str(syl1);
                }
            } else {
                if let Some(ref mut ai) = alt_init
                    && init0 != 0
                {
                    ai.push(init0 as char);
                }
                if let Some(ref mut af) = alt_full {
                    af.push_str(syl0);
                }
            }

            if init0 != 0 {
                primary_init.push(init0 as char);
            }
            let start = primary_full.len() as u16;
            primary_full.push_str(syl0);
            let end = primary_full.len() as u16;
            spans.push((utf16_pos, utf16_len, start, end));
        } else if ch.is_ascii_alphanumeric() {
            let lower = ch.to_ascii_lowercase();
            primary_init.push(lower);
            if let Some(ref mut ai) = alt_init {
                ai.push(lower);
            }
            let start = primary_full.len() as u16;
            primary_full.push(lower);
            if let Some(ref mut af) = alt_full {
                af.push(lower);
            }
            let end = primary_full.len() as u16;
            spans.push((utf16_pos, utf16_len, start, end));
        }
        utf16_pos = utf16_pos.saturating_add(utf16_len);
    }

    let initials = match alt_init {
        Some(alt) if alt != primary_init => format!("{primary_init}|{alt}"),
        _ => primary_init,
    };
    let full = match alt_full {
        Some(alt) if alt != primary_full => format!("{primary_full}|{alt}"),
        _ => primary_full,
    };

    PinyinProjection {
        initials,
        full,
        spans,
        has_cjk,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_chinese_names_to_initials_and_full_pinyin_with_heteronyms() {
        let proj = build_pinyin_projection("重庆报告.pdf");
        assert!(proj.has_cjk);
        assert_eq!(proj.initials, "zqbgpdf|cqbgpdf");
        assert!(proj.full.contains("zhongqingbaogaopdf"));
        assert!(proj.full.contains("chongqingbaogaopdf"));
    }

    #[test]
    fn skips_pure_ascii_and_non_cjk_unicode_overhead() {
        let proj = build_pinyin_projection("file-provider-search.ts");
        assert!(!proj.has_cjk);
        assert!(proj.initials.is_empty());
        assert!(proj.full.is_empty());

        let emoji_proj = build_pinyin_projection("café_😀.txt");
        assert!(!emoji_proj.has_cjk);
        assert!(emoji_proj.spans.is_empty());
    }

    #[test]
    fn tracks_utf16_surrogate_offsets_before_cjk() {
        let proj = build_pinyin_projection("😀重庆.md");
        assert!(proj.has_cjk);
        assert_eq!(proj.initials, "zqmd|cqmd");
        // '😀' takes 2 UTF-16 code units, so '重' starts at 2 and '庆' starts at 3
        assert_eq!(proj.spans[0].0, 2);
        assert_eq!(proj.spans[0].1, 1);
        assert_eq!(proj.spans[1].0, 3);
        assert_eq!(proj.spans[1].1, 1);
    }
}
