from flask import Blueprint, render_template, jsonify, request
import sqlite3
import os

# Tạo Blueprint
map_trans = Blueprint('map_trans', __name__)

# Đường dẫn đến database
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'tourism-landmarks.db')

# Route hiển thị trang map
@map_trans.route('/map')
def show_map():
    """Hiển thị trang bản đồ"""
    return render_template('map_trans.html')

# API: Lấy tất cả địa điểm
@map_trans.route('/api/places', methods=['GET'])
def get_all_places():
    """
    API trả về tất cả địa điểm dạng JSON
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Để trả về dạng dict
        cursor = conn.cursor()
        
        # Query lấy dữ liệu
        query = """
            SELECT 
                id,
                source_id,
                name,
                address,
                description,
                issue_unit,
                issue_date,
                latitude,
                longitude
            FROM your_table_name
            WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            AND latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # Chuyển sang list of dict
        places = []
        for row in rows:
            places.append({
                'id': row['id'],
                'source_id': row['source_id'],
                'name': row['name'],
                'address': row['address'],
                'description': row['description'],
                'issue_unit': row['issue_unit'],
                'issue_date': row['issue_date'],
                'latitude': float(row['latitude']) if row['latitude'] else None,
                'longitude': float(row['longitude']) if row['longitude'] else None
            })
        
        conn.close()
        
        return jsonify({
            'success': True,
            'count': len(places),
            'data': places
        })
        
    except sqlite3.Error as e:
        return jsonify({
            'success': False,
            'error': f'Database error: {str(e)}'
        }), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Server error: {str(e)}'
        }), 500

# API: Lọc địa điểm theo điều kiện
@map_trans.route('/api/places/filter', methods=['GET'])
def filter_places():
    """
    API lọc địa điểm
    Query params:
    - issue_unit: Lọc theo đơn vị
    - keyword: Tìm kiếm trong name và address
    - start_date: Lọc từ ngày
    - end_date: Lọc đến ngày
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Base query
        query = """
            SELECT 
                id, source_id, name, address, description,
                issue_unit, issue_date, latitude, longitude
            FROM your_table_name
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """
        params = []
        
        # Lọc theo issue_unit
        issue_unit = request.args.get('issue_unit')
        if issue_unit:
            query += " AND issue_unit = ?"
            params.append(issue_unit)
        
        # Tìm kiếm keyword
        keyword = request.args.get('keyword')
        if keyword:
            query += " AND (name LIKE ? OR address LIKE ?)"
            params.extend([f'%{keyword}%', f'%{keyword}%'])
        
        # Lọc theo ngày
        start_date = request.args.get('start_date')
        if start_date:
            query += " AND issue_date >= ?"
            params.append(start_date)
        
        end_date = request.args.get('end_date')
        if end_date:
            query += " AND issue_date <= ?"
            params.append(end_date)
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        places = []
        for row in rows:
            places.append({
                'id': row['id'],
                'source_id': row['source_id'],
                'name': row['name'],
                'address': row['address'],
                'description': row['description'],
                'issue_unit': row['issue_unit'],
                'issue_date': row['issue_date'],
                'latitude': float(row['latitude']) if row['latitude'] else None,
                'longitude': float(row['longitude']) if row['longitude'] else None
            })
        
        conn.close()
        
        return jsonify({
            'success': True,
            'count': len(places),
            'data': places
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# API: Lấy thông tin 1 địa điểm cụ thể
@map_trans.route('/api/places/<int:place_id>', methods=['GET'])
def get_place_detail(place_id):
    """Lấy chi tiết 1 địa điểm"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM your_table_name WHERE id = ?
        """, (place_id,))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            place = dict(row)
            return jsonify({
                'success': True,
                'data': place
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Place not found'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# API: Lấy danh sách issue_units (để làm filter dropdown)
@map_trans.route('/api/issue-units', methods=['GET'])
def get_issue_units():
    """Lấy danh sách các đơn vị"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT DISTINCT issue_unit 
            FROM tourism-landmarks.db 
            WHERE issue_unit IS NOT NULL
            ORDER BY issue_unit
        """)
        
        units = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({
            'success': True,
            'data': units
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# API: Thống kê
@map_trans.route('/api/stats', methods=['GET'])
def get_statistics():
    """Lấy thống kê tổng quan"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Tổng số địa điểm
        cursor.execute("SELECT COUNT(*) FROM your_table_name")
        total = cursor.fetchone()[0]
        
        # Số địa điểm có tọa độ
        cursor.execute("""
            SELECT COUNT(*) FROM your_table_name 
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        """)
        with_coords = cursor.fetchone()[0]
        
        # Thống kê theo issue_unit
        cursor.execute("""
            SELECT issue_unit, COUNT(*) as count
            FROM your_table_name
            WHERE issue_unit IS NOT NULL
            GROUP BY issue_unit
            ORDER BY count DESC
        """)
        by_unit = [{'unit': row[0], 'count': row[1]} for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'total': total,
                'with_coordinates': with_coords,
                'without_coordinates': total - with_coords,
                'by_unit': by_unit
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500