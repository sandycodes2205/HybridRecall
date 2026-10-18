INSERT INTO Author(name, email, affiliation) VALUES ('Ada Lovelace', 'ada@example.edu', 'Analytical University'), ('Grace Hopper', 'grace@example.edu', 'Naval Computing Lab') ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO Reviewer(name, email, affiliation, expertise) VALUES ('Alan Turing', 'alan@example.edu', 'Computing Institute', 'Artificial intelligence'), ('Katherine Johnson', 'katherine@example.edu', 'Space Research Center', 'Data analysis') ON DUPLICATE KEY UPDATE name=VALUES(name);

