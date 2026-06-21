import os
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)


basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'alerts.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


class AlertRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    area = db.Column(db.String(100), nullable=False)
    content = db.Column(db.Text, nullable=False)
    severity = db.Column(db.String(20))


with app.app_context():
    db.create_all()

@app.route('/api/generate-alert', methods=['POST'])
def generate_alert():
    data = request.json
    fire_severity = data.get('severity', 'high')
    affected_area = data.get('area', 'Palisades')
    

    message = client.messages.create(
        model="claude-3-5-sonnet-20240620",
        max_tokens=300,
        messages=[{"role": "user", "content": f"Generate a {fire_severity} level wildfire alert for {affected_area}."}]
    )
    alert_text = message.content[0].text
    

    new_alert = AlertRecord(area=affected_area, content=alert_text, severity=fire_severity)
    db.session.add(new_alert)
    db.session.commit()
    
    return jsonify({"alert": alert_text, "id": new_alert.id})

if __name__ == '__main__':
    app.run(debug=True, port=5000)