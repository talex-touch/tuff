import { screen } from 'electron'

export function getAllDisplays(filter: any) {
  const dispalys = screen.getAllDisplays();
  return dispalys.filter(filter);
}