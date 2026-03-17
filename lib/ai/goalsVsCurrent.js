/**
 * Goals vs current AI — короткий переказ блоку аналізу цілей.
 */
const aiClient = require('./aiClient');
const { SYSTEM_PROMPTS, USER_TEMPLATES } = require('./aiPrompts');

async function generateText(goalsBlock) {
  if (!aiClient.isEnabled()) return null;
  const tpl = USER_TEMPLATES && USER_TEMPLATES.GOALS_VS_CURRENT ? USER_TEMPLATES.GOALS_VS_CURRENT : '';
  if (!tpl) return null;
  const userContent = tpl.replace('{{goalsBlock}}', String(goalsBlock || '').trim());
  const messages = [
    { role: 'system', content: SYSTEM_PROMPTS.GOALS_VS_CURRENT },
    { role: 'user', content: userContent }
  ];
  const result = await aiClient.chatCompletion(messages, {
    maxTokens: 220,
    temperature: 0.6
  });
  return result && result.content ? result.content.trim() : null;
}

module.exports = { generateText };

