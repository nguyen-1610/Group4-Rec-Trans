from flask import Flask, render_template
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))

app = Flask(
	__name__,
	template_folder=os.path.join(BASE_DIR, 'frontend', 'templates'),
	static_folder=os.path.join(BASE_DIR, 'frontend', 'static')
)

@app.route('/')
def index():
	return render_template('home.html')

@app.route('/register')
@app.route('/register/')
def register():
	return render_template('register.html')

@app.route('/login')
@app.route('/login/')
def login():
	return render_template('login.html')

@app.route('/astar')
def astar_demo():
	return render_template('astar.html')

if __name__ == '__main__':
	app.run(debug=True)