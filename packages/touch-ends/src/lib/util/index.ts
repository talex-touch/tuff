function isOptional (val) {
  // undefined , null , ""  , "    ", 皆通过
  if (val === undefined) {
    return true;
  }
  if (val === null) {
    return true;
  }
  if (typeof val === 'string') {
    return val === '' || val.trim() === '';
  }
  return false;
}

export { isOptional };

export default () => {}
