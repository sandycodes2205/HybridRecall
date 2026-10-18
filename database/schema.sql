CREATE TABLE IF NOT EXISTS Author (
  author_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(320) NOT NULL UNIQUE, affiliation VARCHAR(255), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Reviewer (
  reviewer_id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, email VARCHAR(320) NOT NULL UNIQUE, affiliation VARCHAR(255), expertise VARCHAR(500), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Submission (
  submission_id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, abstract TEXT NOT NULL, status ENUM('SUBMITTED','UNDER_REVIEW','ACCEPTED','REJECTED') NOT NULL DEFAULT 'SUBMITTED', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finalized_at TIMESTAMP NULL, INDEX idx_submission_status(status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS SubmissionAuthor (
  submission_id INT NOT NULL, author_id INT NOT NULL, author_order INT NOT NULL DEFAULT 1, PRIMARY KEY(submission_id, author_id), UNIQUE KEY uq_submission_author_order(submission_id, author_order), FOREIGN KEY(submission_id) REFERENCES Submission(submission_id) ON DELETE CASCADE, FOREIGN KEY(author_id) REFERENCES Author(author_id) ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS ReviewAssignment (
  assignment_id INT AUTO_INCREMENT PRIMARY KEY, submission_id INT NOT NULL, reviewer_id INT NOT NULL, assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_assignment(submission_id, reviewer_id), FOREIGN KEY(submission_id) REFERENCES Submission(submission_id) ON DELETE CASCADE, FOREIGN KEY(reviewer_id) REFERENCES Reviewer(reviewer_id) ON DELETE RESTRICT, INDEX idx_assignment_reviewer(reviewer_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Review (
  review_id INT AUTO_INCREMENT PRIMARY KEY, assignment_id INT NOT NULL UNIQUE, score DECIMAL(3,1) NOT NULL, comments TEXT NOT NULL, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT chk_review_score CHECK(score BETWEEN 1 AND 10), FOREIGN KEY(assignment_id) REFERENCES ReviewAssignment(assignment_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS AuditLog (
  audit_id INT AUTO_INCREMENT PRIMARY KEY, submission_id INT NOT NULL, action VARCHAR(100) NOT NULL, details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(submission_id) REFERENCES Submission(submission_id) ON DELETE CASCADE, INDEX idx_audit_submission(submission_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS SimilarityFlag (
  flag_id INT AUTO_INCREMENT PRIMARY KEY, submission_id INT NOT NULL, compared_submission_id INT NOT NULL, similarity_score DECIMAL(5,4) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_similarity_pair(submission_id, compared_submission_id), CONSTRAINT chk_similarity_score CHECK(similarity_score BETWEEN 0 AND 1), FOREIGN KEY(submission_id) REFERENCES Submission(submission_id) ON DELETE CASCADE, FOREIGN KEY(compared_submission_id) REFERENCES Submission(submission_id) ON DELETE CASCADE
) ENGINE=InnoDB;

DELIMITER $$
CREATE FUNCTION AvgScore(p_submission_id INT) RETURNS DECIMAL(4,2) READS SQL DATA
BEGIN
  DECLARE result DECIMAL(4,2); SELECT ROUND(AVG(r.score), 2) INTO result FROM Review r JOIN ReviewAssignment ra ON ra.assignment_id=r.assignment_id WHERE ra.submission_id=p_submission_id; RETURN result;
END$$
CREATE PROCEDURE FinalizeDecision(IN p_submission_id INT)
BEGIN
  DECLARE review_count INT; DECLARE average_score DECIMAL(4,2); DECLARE next_status VARCHAR(20); DECLARE current_status VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT status INTO current_status FROM Submission WHERE submission_id=p_submission_id FOR UPDATE;
  IF current_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Submission not found'; END IF;
  IF current_status IN ('ACCEPTED','REJECTED') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Submission is already finalized'; END IF;
  SELECT COUNT(*), AvgScore(p_submission_id) INTO review_count, average_score FROM Review r JOIN ReviewAssignment ra ON ra.assignment_id=r.assignment_id WHERE ra.submission_id=p_submission_id;
  IF review_count < 2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='At least two submitted reviews are required'; END IF;
  SET next_status = IF(average_score >= 7.0, 'ACCEPTED', 'REJECTED');
  UPDATE Submission SET status=next_status, finalized_at=CURRENT_TIMESTAMP WHERE submission_id=p_submission_id;
  INSERT INTO AuditLog(submission_id, action, details) VALUES(p_submission_id, 'DECISION_FINALIZED', CONCAT('Decision: ', next_status, '; average score: ', average_score));
  COMMIT;
  SELECT next_status AS decision, average_score;
END$$
DELIMITER ;

