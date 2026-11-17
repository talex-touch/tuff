use std::fmt;

#[derive(Debug, PartialEq, Eq)]
pub enum Base64DecodeError {
    InvalidLength,
    InvalidCharacter,
    InvalidPadding,
    OutputLimitExceeded,
}

impl fmt::Display for Base64DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLength => f.write_str("Base64 input has invalid length"),
            Self::InvalidCharacter => f.write_str("Base64 input contains an invalid character"),
            Self::InvalidPadding => f.write_str("Base64 input has invalid padding"),
            Self::OutputLimitExceeded => f.write_str("Base64 decoded payload exceeds byte limit"),
        }
    }
}

#[inline]
fn decode_sextet(byte: u8) -> Option<u8> {
    match byte {
        b'A'..=b'Z' => Some(byte - b'A'),
        b'a'..=b'z' => Some(byte - b'a' + 26),
        b'0'..=b'9' => Some(byte - b'0' + 52),
        b'+' => Some(62),
        b'/' => Some(63),
        _ => None,
    }
}

/// Decodes standard RFC 4648 Base64 (ignoring ASCII whitespace) up to `max_bytes`.
pub fn decode_with_limit(input: &str, max_bytes: usize) -> Result<Vec<u8>, Base64DecodeError> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity((bytes.len() / 4) * 3);
    let mut quartet = [0u8; 4];
    let mut q_len = 0usize;
    let mut padding_seen = false;

    for &b in bytes {
        if b.is_ascii_whitespace() {
            continue;
        }
        if padding_seen && b != b'=' {
            return Err(Base64DecodeError::InvalidPadding);
        }
        if b == b'=' {
            padding_seen = true;
        }
        quartet[q_len] = b;
        q_len += 1;
        if q_len == 4 {
            flush_quartet(&quartet, &mut output, max_bytes)?;
            q_len = 0;
        }
    }

    if q_len != 0 {
        return Err(Base64DecodeError::InvalidLength);
    }

    Ok(output)
}

fn flush_quartet(
    q: &[u8; 4],
    output: &mut Vec<u8>,
    max_bytes: usize,
) -> Result<(), Base64DecodeError> {
    let v0 = decode_sextet(q[0]).ok_or(Base64DecodeError::InvalidCharacter)?;
    let v1 = decode_sextet(q[1]).ok_or(Base64DecodeError::InvalidCharacter)?;

    match (q[2], q[3]) {
        (b'=', b'=') => {
            if output.len() + 1 > max_bytes {
                return Err(Base64DecodeError::OutputLimitExceeded);
            }
            output.push((v0 << 2) | (v1 >> 4));
        }
        (c2, b'=') => {
            let v2 = decode_sextet(c2).ok_or(Base64DecodeError::InvalidCharacter)?;
            if output.len() + 2 > max_bytes {
                return Err(Base64DecodeError::OutputLimitExceeded);
            }
            output.push((v0 << 2) | (v1 >> 4));
            output.push((v1 << 4) | (v2 >> 2));
        }
        (b'=', _) => return Err(Base64DecodeError::InvalidPadding),
        (c2, c3) => {
            let v2 = decode_sextet(c2).ok_or(Base64DecodeError::InvalidCharacter)?;
            let v3 = decode_sextet(c3).ok_or(Base64DecodeError::InvalidCharacter)?;
            if output.len() + 3 > max_bytes {
                return Err(Base64DecodeError::OutputLimitExceeded);
            }
            output.push((v0 << 2) | (v1 >> 4));
            output.push((v1 << 4) | (v2 >> 2));
            output.push((v2 << 6) | v3);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_standard_vectors() {
        assert_eq!(decode_with_limit("", 16).unwrap(), b"");
        assert_eq!(decode_with_limit("Zg==", 16).unwrap(), b"f");
        assert_eq!(decode_with_limit("Zm8=", 16).unwrap(), b"fo");
        assert_eq!(decode_with_limit("Zm9v", 16).unwrap(), b"foo");
        assert_eq!(
            decode_with_limit("SGVsbG8g\nV29ybGQh", 32).unwrap(),
            b"Hello World!"
        );
    }

    #[test]
    fn rejects_invalid_inputs() {
        assert_eq!(
            decode_with_limit("abc", 16),
            Err(Base64DecodeError::InvalidLength)
        );
        assert_eq!(
            decode_with_limit("ab$=", 16),
            Err(Base64DecodeError::InvalidCharacter)
        );
        assert_eq!(
            decode_with_limit("a=bc", 16),
            Err(Base64DecodeError::InvalidPadding)
        );
        assert_eq!(
            decode_with_limit("SGVsbG8=", 4),
            Err(Base64DecodeError::OutputLimitExceeded)
        );
    }
}
