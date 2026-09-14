import assert from 'node:assert/strict';
import { TANNER_SCALE, TANNER_DIMENSIONS, EVALUATION_ONBOARDING, categoryStage, guidanceForCategory } from '../v2/evaluation-guidance.js';

assert.equal(TANNER_DIMENSIONS.length,5,'La metodología debe conservar cinco dimensiones');
assert.deepEqual([1,2,3,4,5].map(level=>TANNER_SCALE[level].label),['En formación','Tomando ritmo','En nivel','Sobresale','Alto nivel']);
assert.match(TANNER_SCALE[3].confirmation,/Está donde debe estar/);
assert.match(TANNER_SCALE[5].detail,/edad y categoría/,'5 debe estar contextualizado por etapa');
assert.equal(TANNER_SCALE.none.label,'Sin evidencia');
assert.equal(EVALUATION_ONBOARDING.length,3,'El onboarding no debe exceder tres cards');
for(const category of ['T6','T8','T10','T12']){
  assert.equal(categoryStage(`Categoría ${category}`),category);
  assert.ok(guidanceForCategory(category).text.length>40,`${category} necesita guía contextual`);
}
for(const dimension of TANNER_DIMENSIONS){
  assert.ok(dimension.observations.length>=4,`${dimension.name} necesita observaciones`);
  assert.ok(dimension.question.startsWith('¿'),`${dimension.name} necesita una pregunta de decisión`);
}
console.log('Evaluation guidance QA OK');
