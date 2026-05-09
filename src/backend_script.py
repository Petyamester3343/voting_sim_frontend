import os
from typing import Any

from flask import Flask, jsonify, request
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

app = Flask(__name__)


def create_database_url() -> URL:
  server = os.getenv("VOTING_DB_SERVER", r"DESKTOP-GT5C1GK\PRIM")
  database = os.getenv("VOTING_DB_NAME", "Projekt")
  driver = os.getenv("VOTING_DB_DRIVER", "SQL Server")
  username = os.getenv("VOTING_DB_USER")
  password = os.getenv("VOTING_DB_PASSWORD")

  connection_parts = [
    f"DRIVER={{{driver}}}",
    f"SERVER={server}",
    f"DATABASE={database}",
    "TrustServerCertificate=yes",
  ]

  if username and password:
    connection_parts.extend([f"UID={username}", f"PWD={password}"])
  else:
    connection_parts.append("Trusted_Connection=yes")

  return URL.create(
    "mssql+pyodbc",
    query={"odbc_connect": ";".join(connection_parts)},
  )


engine = create_engine(create_database_url(), pool_pre_ping=True, future=True)


def json_error(message: str, status_code: int):
  response = jsonify({"error": message})
  response.status_code = status_code
  return response


def rows_to_dicts(rows) -> list[dict[str, Any]]:
  return [dict(row._mapping) for row in rows]


@app.get("/api/health")
def health():
  try:
    with engine.connect() as connection:
      connection.execute(text("SELECT 1"))
    return jsonify({"status": "ok"})
  except SQLAlchemyError as exc:
    return json_error(f"Database connection error: {exc}", 503)


@app.get("/api/counties")
def get_counties():
  statement = text(
    """
    SELECT megye AS id, megye AS name
    FROM Votesector
    GROUP BY megye
    ORDER BY megye
    """
  )

  try:
    with engine.connect() as connection:
      counties = rows_to_dicts(connection.execute(statement))
    return jsonify(counties)
  except SQLAlchemyError as exc:
    return json_error(f"Failed to query counties: {exc}", 500)


@app.get("/api/parties")
def get_parties():
  statement = text(
    """
    SELECT nev AS id, nev AS name
    FROM Parties
    ORDER BY nev
    """
  )

  try:
    with engine.connect() as connection:
      parties = rows_to_dicts(connection.execute(statement))
    return jsonify(parties)
  except SQLAlchemyError as exc:
    return json_error(f"Failed to query parties: {exc}", 500)


@app.get("/api/representatives")
def get_representatives():
  statement = text(
    """
    SELECT
      CAST(ID AS NVARCHAR(50)) AS id,
      CONCAT(vezeteknev, ' ', keresztnev) AS name,
      megye AS countyId,
      valasztokorlet AS sector,
      nev AS partyId
    FROM Candidates
    ORDER BY megye, valasztokorlet, nev, vezeteknev, keresztnev
    """
  )

  try:
    with engine.connect() as connection:
      representatives = rows_to_dicts(connection.execute(statement))
    return jsonify(representatives)
  except SQLAlchemyError as exc:
    return json_error(f"Failed to query candidates: {exc}", 500)


@app.post("/api/votes")
def submit_vote():
  payload = request.get_json(silent=True) or {}
  required_fields = [
    "firstName",
    "lastName",
    "pid",
    "countyId",
    "sector",
    "partyId",
    "representativeId",
  ]
  missing_fields = [field for field in required_fields if not payload.get(field)]

  if missing_fields:
    return json_error("Missing fields: " + ", ".join(missing_fields), 400)

  try:
    sector = int(payload["sector"])
    representative_id = int(payload["representativeId"])
  except (TypeError, ValueError):
    return json_error("Invalid sector or candidate ID.", 400)

  params = {
    "representative_id": representative_id,
    "party_id": payload["partyId"],
    "county_id": payload["countyId"],
    "sector": sector,
    "pid": payload["pid"].strip().upper(),
  }

  candidate_statement = text(
    """
    SELECT ID, nev
    FROM Candidates
    WHERE ID = :representative_id
      AND nev = :party_id
      AND megye = :county_id
      AND valasztokorlet = :sector
    """
  )
  voter_statement = text(
    """
    SELECT szigszam
    FROM Voters
    WHERE szigszam = :pid
    """
  )
  update_statement = text(
    """
    UPDATE Voters
    SET ID = :representative_id,
        nev = :party_id,
        megye = :county_id,
        valasztokorlet = :sector
    WHERE szigszam = :pid
    """
  )

  try:
    with engine.begin() as connection:
      candidate = connection.execute(candidate_statement, params).first()
      if candidate is None:
        return json_error(
          "Chosen candidate is not part of the given party, county, or vote sector!",
          400,
        )

      voter = connection.execute(voter_statement, params).first()
      if voter is None:
        return json_error("Nobody was found by the given PID!", 404)

      result = connection.execute(update_statement, params)
      if result.rowcount != 1:
        return json_error(
          "Vote record failed to make exact update on a voter!",
          409,
        )

    return jsonify(
      {
        "confirmation": (
          f"Vote recorded: {payload['lastName']} {payload['firstName']} "
          f"Thank you for using our service."
        )
      }
    )
  except SQLAlchemyError as exc:
    return json_error(f"Vote record error: {exc}", 500)


@app.post("/voting_proc")
def voting_proc():
  return submit_vote()


if __name__ == "__main__":
  app.run(
    host=os.getenv("VOTING_API_HOST", "127.0.0.1"),
    port=int(os.getenv("VOTING_API_PORT", "5000")),
  )
