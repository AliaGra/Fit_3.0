-- Уточнення неймінгу: goal_hips = бажані ягодиці (users.glutes), не стегно (users.hip).
-- Окремих цілей goal_neck / goal_wrist немає свідомо.

COMMENT ON COLUMN user_body_goals.goal_hips IS
  'Бажані ягодиці (см); відповідає users.glutes. НЕ стегно (users.hip). Окремих goal_neck / goal_wrist немає (шия — % жиру, запʼястя — кістяк).';
