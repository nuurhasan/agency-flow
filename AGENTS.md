# Architecture rules
- Password recovery uses Cloud Auth's standard recovery emails and a public `/reset-password` route; never substitute a normal signed-in session for a recovery session.