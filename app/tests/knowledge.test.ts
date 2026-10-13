import {test,expect} from 'vitest';
import {project_player_view} from '../src/core/knowledge';
import {alternatives} from './fixtures/knowledge-states';
import {player_view} from '../src/dto';
import {legalKnowledge} from './fixtures/legal-knowledge';
test('authored private alternatives do not alter any legal knowledge, eligibility, gaps, counts or sorting',()=>{
  const [a,b]=alternatives.map(project_player_view);
  expect(a).toEqual(b);expect(a).toEqual(legalKnowledge);expect(player_view(a)).toBe(true);
  expect(a.position.x).toBe(50);expect(a.finished).toBe(false);expect(a.can_issue).toBe(false);
  expect(a.report.source_event_time).toEqual({kind:'unknown'});
  expect(JSON.stringify(a)).not.toContain('ENGINE_ONLY');
  expect(project_player_view(alternatives[1])).toEqual(a);
});
