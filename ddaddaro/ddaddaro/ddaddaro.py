#-------------------------------------------------------------------------------
# 프로그램 명: Integrated Cake Robot Control System
# 주요 기능: 
#   1. 이미지 수신 및 OpenCV 기반 경로 추출(Skeletonization)
#   2. 픽셀 좌표의 로봇 좌표계(mm) 변환 및 실시간 경로 생성
#   3. Doosan Robot을 이용한 케이크 레터링 드로잉 및 이송(Pick & Place)
#   4. 로봇 에러 상태 모니터링 및 작업 중단 지점 자동 복구(Error Recovery)
#-------------------------------------------------------------------------------

import rclpy
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor
from rclpy.callback_groups import ReentrantCallbackGroup
from sensor_msgs.msg import CompressedImage
from std_msgs.msg import Int32, String
from dsr_msgs2.srv import SetRobotControl
import numpy as np
import cv2
from skimage.morphology import skeletonize
import networkx as nx
import DR_init
import time
import threading

class IntegratedCakeNode(Node):
    #---------------------------------------------------------------------------
    # 함수: __init__
    # 기능: 노드 초기화, ROS 통신 설정, 로봇 작업 좌표 및 변수 정의
    #---------------------------------------------------------------------------
    def __init__(self, robot_id):
        super().__init__('integrated_cake_node', namespace=robot_id)
        self.robot_id = robot_id
        self.callback_group = ReentrantCallbackGroup()
        
        #--------------------------------
        # ROS 통신 설정 (구독/발행)
        #--------------------------------
        self.subscription = self.create_subscription(
            CompressedImage, 
            '/ddaddabot/generated_image/compressed', 
            self.listener_callback, 
            10,
            callback_group=self.callback_group
        )
        self.progress_pub = self.create_publisher(Int32, '/ddaddabot/progress_rate', 10)
        
        #--------------------------------
        # 드로잉 작업용 물리 파라미터
        #--------------------------------
        self.center_x, self.center_y = 442.811, -28.167
        self.Z_SAFE, self.Z_DRAW, self.Z_INTERVAL = 270, 199, 202
        self.VEL_DRAW, self.ACC_DRAW = 500, 300
        self.ROLL, self.PITCH, self.YAW = 90, -90, 90

        #--------------------------------
        # 로봇 고정 포즈 데이터 (Joint & Task)
        #--------------------------------
        self.home_pos_data = (18.25, 12.6, 86.95, -266.86, -107.52, -169.84)
        self.p0_data = (5.85, 42.1, 79.19, -349.41, -31.67, -98.82)
        self.p1_data = (5.427, 47.685, 68.577, -348.479, -26.680, -100.076)
        self.p2_data = (5.41, 41.03, 57.45, -328.67, -9.84, -120.74)
        self.p1_1_data = (979.000, 64, 247.938, 180, -90, 90.000)

        #--------------------------------
        # 케이크 조작 관련 세부 위치 데이터
        #--------------------------------
        self.cake_initial_pose_0 = (445.612, 76, 300, 0.403, 179.844, 90.395)
        self.cake_initial_pose_0_j = (9.21, 14.68, 56.73, -179.97, -108.59, -81.14)
        self.cake_initial_pose = (445.612, 76, 60, 0.403, 179.844, 90.395)
        self.cake_center_pose = (443.611, -161.786, 60, 148.843, -179.828, -121.166)
        self.cake_center_pose_2 = (443.611, -159, 60, 148.843, -179.828, -121.166)
        self.cake_center_pose_up = (443.611, -161.786, 200, 148.843, -179.828, -121.166)
        self.cake_pickup_pose = (443.612, -430, 60, 148.869, -179.828, -121.140)
        self.cake_pickup_pose_up = (443.612, -430, 200, 148.869, -179.828, -121.140)
        self.cake_pickup_pose_upx = (-87.47, 22.29, 113.01, -267.68, 90.49, -138.09)
        self.cake_pickup_pose_downx = (300, -390, 10.780, -180, -90, -180)
        self.cake_pickup_pose_x =(370, -390, 10.780, -180, -90, -180)
        self.cake_pick_pose = (370, -390, 330, -180, -90, -180)
        self.cake_lack_pose_up = (980, -349.727, 337.430, 0, 90, 0)
        self.cake_lack_pose = (980, -349.727, 251.708, 0, 90, -0)
        self.cake_lack_pose_home = (750, -349.727, 251.708, 0, 90, -0)
        self.cake_lack_pose_home_2 = (-41.57, 25.92, 80.57, -252.32, 44.5, -113.89)

        #--------------------------------
        # 시스템 상태 및 복구 관련 변수
        #--------------------------------
        self.last_robot_state = 1
        self.is_running = False
        self.current_paths = []
        self.saved_stroke_idx = 0
        self.saved_point_idx = 0
        self.is_error_recovery_mode = False

        self.CONTROL_RESET_SAFE_STOP = 2
        self.CONTROL_RESET_SAFE_OFF = 3

        self.get_logger().info(f"Integrated Cake Node Initialized: {robot_id}")
        
        # 로봇 상태 감시 스레드 실행
        self.monitor_thread = threading.Thread(target=self.robot_state_monitor_loop)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()

    #---------------------------------------------------------------------------
    # 함수: set_digital_outputs
    # 기능: 리스트에 담긴 인덱스에 따라 DO(Digital Output) 신호를 일괄 제어
    #---------------------------------------------------------------------------
    def set_digital_outputs(self, values):
        from DSR_ROBOT2 import set_digital_output
        for val in values:
            index, signal = abs(val), (1 if val > 0 else 0)
            set_digital_output(index, signal)

    #---------------------------------------------------------------------------
    # 함수: call_set_robot_control
    # 기능: 로봇 시스템에 제어 명령(리셋 등)을 서비스 호출로 전달
    #---------------------------------------------------------------------------
    def call_set_robot_control(self, control_value):
        srv_name = f'/{self.robot_id}/system/set_robot_control'
        cli = self.create_client(SetRobotControl, srv_name)
        if not cli.wait_for_service(timeout_sec=3.0): return False
        req = SetRobotControl.Request()
        req.robot_control = control_value
        future = cli.call_async(req)
        start_t = time.time()
        while rclpy.ok() and not future.done():
            if time.time() - start_t > 10.0: return False
            time.sleep(0.1)
        return future.result().success if future.done() else False

    #---------------------------------------------------------------------------
    # 함수: robot_state_monitor_loop
    # 기능: 백그라운드에서 로봇의 에러 상태를 감시하고 자동 복구 시퀀스 수행
    #---------------------------------------------------------------------------
    def robot_state_monitor_loop(self):
        from DSR_ROBOT2 import get_robot_state, drl_script_stop, DR_QSTOP_STO
        while rclpy.ok():
            try:
                state = get_robot_state()
                if state is not None:
                    self.last_robot_state = state

                # 에러 감지 시 안전 조치 및 리셋 호출
                if state in [3, 5, 6]:
                    if not self.is_error_recovery_mode:
                        self.get_logger().error(f"!!! 에러 감지 (상태 {state}) !!!")
                        self.is_error_recovery_mode = True 
                        self.is_running = False
                        self.set_digital_outputs([-1, 2, -3])
                        drl_script_stop(DR_QSTOP_STO)
                        time.sleep(2.0)
                        cmd = self.CONTROL_RESET_SAFE_OFF if state == 3 else self.CONTROL_RESET_SAFE_STOP
                        self.call_set_robot_control(cmd)
                
                # 정상 복구 시 작업 재개
                elif state == 1 and self.is_error_recovery_mode:
                    self.get_logger().info("로봇 정상 복구됨. 작업을 재개합니다.")
                    time.sleep(1.0)
                    self.is_error_recovery_mode = False 
                    if not self.is_running:
                        threading.Thread(target=self.execute_robot_drawing).start()
            except Exception:
                pass
            time.sleep(0.5)

    #---------------------------------------------------------------------------
    # 함수: execute_robot_drawing
    # 기능: 추출된 경로를 바탕으로 로봇의 실제 이동 및 도구 제어 수행 (메인 시퀀스)
    #---------------------------------------------------------------------------
    def execute_robot_drawing(self, paths=None):
        if paths is not None:
            self.current_paths = paths
            self.saved_stroke_idx = 0
            self.saved_point_idx = 0
            self.get_logger().info(f"새 이미지 수신: 총 {len(paths)}획")

        if not self.current_paths: return
        if self.is_running and not self.is_error_recovery_mode: return
        
        self.is_running = True
        from DSR_ROBOT2 import movel, movej,amovel, posj, posx, wait
        
        try:
            #--------------------------------
            # 데이터 객체화 (좌표 변환)
            #--------------------------------
            p0, p1, p2, home_pos = posj(*self.p0_data), posj(*self.p1_data), posj(*self.p2_data), posj(*self.home_pos_data)
            cake_initial_pose_0 = posx(*self.cake_initial_pose_0)
            cake_initial_pose_0_j = posj(*self.cake_initial_pose_0_j)
            cake_initial_pose = posx(*self.cake_initial_pose) 
            cake_center_pose = posx(*self.cake_center_pose)
            cake_center_pose_2 = posx(*self.cake_center_pose_2)
            cake_center_pose_up = posx(*self.cake_center_pose_up)
            cake_pickup_pose = posx(*self.cake_pickup_pose)
            cake_pickup_pose_up = posx(*self.cake_pickup_pose_up)
            cake_pickup_pose_upx = posj(*self.cake_pickup_pose_upx)
            cake_pickup_pose_downx = posx(*self.cake_pickup_pose_downx)
            cake_pickup_pose_x = posx(*self.cake_pickup_pose_x)
            cake_pick_pose = posx(*self.cake_pick_pose)
            cake_lack_pose_up = posx(*self.cake_lack_pose_up)
            cake_lack_pose = posx(*self.cake_lack_pose)
            cake_lack_pose_home = posx(*self.cake_lack_pose_home)
            cake_lack_pose_home_2 = posj(*self.cake_lack_pose_home_2)
            p1_1 = posx(*self.p1_1_data)

            total_points = sum(len(p) for p in self.current_paths)
            total_strokes = len(self.current_paths)

            #--------------------------------
            # 초기 단계: 케이크 이송 및 대기 위치 이동
            #--------------------------------
            if self.saved_stroke_idx == 0 and self.saved_point_idx == 0:
                self.set_digital_outputs([1, 2, 3])
                wait(1.0)
                movel(cake_initial_pose_0, vel=50, acc=50)
                movel(cake_initial_pose, vel=50, acc=50)
                self.set_digital_outputs([1, -2, -3])
                wait(1.0)
                movel(cake_center_pose, vel=250, acc=200)
                wait(2.0)
                self.set_digital_outputs([1, 2, 3])
                wait(1.0)
                movel(cake_center_pose_up, vel=250, acc=200)
                
                # 레터링 도구 준비
                self.set_digital_outputs([-1, -2, 3])
                movej(home_pos, vel=100, acc=50); movej(p0, vel=100, acc=50)
                movej(p1, vel=100, acc=50); self.set_digital_outputs([-1, 2, -3])
                wait(1.0); movej(p2, vel=100, acc=50)
            
            #--------------------------------
            # 복구 단계: 중단 지점 재접근
            #--------------------------------
            else:
                self.get_logger().info(f"== [복구 재개] Stroke {self.saved_stroke_idx}, Point {self.saved_point_idx} ==")
                pt = self.current_paths[self.saved_stroke_idx][self.saved_point_idx]
                movel(posx(pt[0], pt[1], self.Z_SAFE, self.ROLL, self.PITCH, self.YAW), vel=100, acc=50)
                movel(posx(pt[0], pt[1], self.Z_INTERVAL, self.ROLL, self.PITCH, self.YAW), vel=100, acc=50)
                self.set_digital_outputs([1, -2, -3])
                wait(3.5)
                movel(posx(pt[0], pt[1], self.Z_DRAW, self.ROLL, self.PITCH, self.YAW), vel=50, acc=30)

            completed_points_count = sum(len(self.current_paths[i]) for i in range(self.saved_stroke_idx))

            #--------------------------------
            # 드로잉 루프: 실제 경로 추종 이동
            #--------------------------------
            for s_idx in range(self.saved_stroke_idx, total_strokes):
                path = self.current_paths[s_idx]
                self.saved_stroke_idx = s_idx 
                start_p_idx = self.saved_point_idx if s_idx == self.saved_stroke_idx else 0

                for p_idx in range(start_p_idx, len(path)):
                    self.get_logger().info(f"[Stroke {s_idx + 1}/{total_strokes}] Point {p_idx + 1}/{len(path)} 이동 중...")

                    if self.is_error_recovery_mode or self.last_robot_state in [3, 5, 6]:
                        self.get_logger().error(f"!!! 작업 중단 !!! 위치: Stroke {s_idx}, Point {p_idx}")
                        self.saved_point_idx = p_idx
                        self.is_running = False
                        return 

                    done_count = completed_points_count + p_idx
                    self.progress_pub.publish(Int32(data=int((done_count/total_points)*100)))

                    pt = path[p_idx]
                    p_target = posx(pt[0], pt[1], self.Z_DRAW, self.ROLL, self.PITCH, self.YAW)
                    
                    # 획의 시작, 끝, 중간 과정에 따른 모션 제어
                    if p_idx == 0:
                        movel(posx(pt[0], pt[1], self.Z_DRAW+3, self.ROLL, self.PITCH, self.YAW), vel=self.VEL_DRAW, acc=self.ACC_DRAW)
                        self.set_digital_outputs([1, -2, -3]); wait(3.5)
                        movel(p_target, vel=self.VEL_DRAW, acc=self.ACC_DRAW)
                    elif p_idx >= len(path) - 2:
                        self.set_digital_outputs([-1, 2, -3])
                        movel(posx(pt[0], pt[1], self.Z_INTERVAL, self.ROLL, self.PITCH, self.YAW), vel=100, acc=30, radius=0)
                    else:
                        amovel(p_target, vel=self.VEL_DRAW, acc=self.ACC_DRAW, radius=2)
                        time.sleep(0.1)

                    self.saved_point_idx = p_idx 

                completed_points_count += len(path)
                self.saved_point_idx = 0 
                movel(posx(path[-1][0], path[-1][1], self.Z_SAFE, self.ROLL, self.PITCH, self.YAW), vel=100, acc=50)

            #--------------------------------
            # 마무리 단계: 케이크 선반 적재 및 홈 복귀
            #--------------------------------
            self.set_digital_outputs([-1, 2, -3]); movej(p2, vel=100, acc=50)
            movel(p1_1, vel=20, acc=20); self.set_digital_outputs([-1, -2, 3])
            self.saved_stroke_idx = 0; self.saved_point_idx = 0
            self.get_logger().info("모든 작업 완료!")

            # 케이크 픽업 및 선반 적재 시퀀스
            movej(home_pos, vel=100, acc=50)
            self.set_digital_outputs([1, 2, 3])
            movel(cake_center_pose_2, vel=100, acc=50)
            self.set_digital_outputs([1, -2, -3])
            movel(cake_pickup_pose, vel=100, acc=50)
            self.set_digital_outputs([1, 2, 3])
            wait(2.0)
            movel(cake_pickup_pose_up, vel=200, acc=100)
            movej(cake_pickup_pose_upx, vel=40, acc=60)
            movel(cake_pickup_pose_downx, vel=40, acc=60)
            movel(cake_pickup_pose_x, vel=40, acc=60)
            wait(1.0)
            self.set_digital_outputs([1, -2, -3])
            wait(3.0)
            movel(cake_pick_pose, vel=200, acc=100)
            movel(cake_lack_pose_up, vel=200, acc=100)
            movel(cake_lack_pose, vel=200, acc=100)
            self.set_digital_outputs([-1, -2, 3])
            
            # 최종 복귀
            movel(cake_lack_pose_home, vel=60, acc=30)
            movej(cake_lack_pose_home_2, vel=60, acc=30)
            movej(cake_initial_pose_0_j, vel=60, acc=30)

        finally:
            self.is_running = False

    #---------------------------------------------------------------------------
    # 함수: listener_callback
    # 기능: ROS 토픽으로 이미지를 수신했을 때 호출되어 이미지 처리 프로세스 시작
    #---------------------------------------------------------------------------
    def listener_callback(self, msg):
        if self.is_running: return
        self.get_logger().info(f"이미지 수신 완료!")
        rel_paths = self.process_image_to_path(msg.data)
        if rel_paths:
            # 상대 픽셀 좌표를 로봇 중심 mm 좌표로 변환
            abs_paths = [[(round(self.center_x + x, 3), round(self.center_y + y, 3)) for x, y in s] for s in rel_paths]
            threading.Thread(target=self.execute_robot_drawing, args=(abs_paths,)).start()

    #---------------------------------------------------------------------------
    # 함수: process_image_to_path
    # 기능: 이미지 전처리, 사용자 임계값 설정, 스켈레톤 추출 및 그래프 경로 생성
    #---------------------------------------------------------------------------
    def process_image_to_path(self, jpeg_buffer):
        import cv2, numpy as np, networkx as nx
        from skimage.morphology import skeletonize
        FIXED_IMG_SIZE = 1000
        FIXED_SCALE = 0.3
        np_arr = np.frombuffer(jpeg_buffer, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_GRAYSCALE)
        if img is None: return []
        if img.shape[0] != FIXED_IMG_SIZE:
            img = cv2.resize(img, (FIXED_IMG_SIZE, FIXED_IMG_SIZE))
        
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        #--------------------------------
        # 실시간 임계값 조절 GUI 루프
        #--------------------------------
        window_name = "Threshold Adjustment"
        cv2.namedWindow(window_name)
        cv2.createTrackbar("Min Thresh", window_name, 50, 255, lambda x: None)
        cv2.createTrackbar("Max Thresh", window_name, 150, 255, lambda x: None)

        self.get_logger().info("임계값 조절 후 Enter키를 누르세요.")

        while True:
            min_val = cv2.getTrackbarPos("Min Thresh", window_name)
            max_val = cv2.getTrackbarPos("Max Thresh", window_name)
            _, binary_preview = cv2.threshold(gray, min_val, max_val, cv2.THRESH_BINARY_INV)
            cv2.imshow(window_name, binary_preview)
            key = cv2.waitKey(1) & 0xFF
            if key == 13: # Enter
                _, binary = cv2.threshold(gray, min_val, max_val, cv2.THRESH_BINARY_INV)
                break
            elif key == 27: # ESC
                cv2.destroyWindow(window_name)
                return []

        cv2.destroyWindow(window_name)

        #--------------------------------
        # 이미지 모폴로지 처리 및 스켈레톤화
        #--------------------------------
        kernel = np.ones((3,3), np.uint8)
        binary = cv2.dilate(binary.astype(np.uint8), kernel, iterations=1) 
        binary = cv2.GaussianBlur(binary, (3,3), 0)
        skeleton = skeletonize(binary / 255)

        #--------------------------------
        # 그래프 기반 경로 탐색 및 최적화
        #--------------------------------
        nodes = np.column_stack(np.where(skeleton > 0))
        G = nx.Graph()
        for r, c in nodes:
            G.add_node((r, c))
            for dr in range(-1, 2):
                for dc in range(-1, 2):
                    if dr == 0 and dc == 0: continue
                    nr, nc = r + dr, c + dc
                    if (nr, nc) in G: G.add_edge((r, c), (nr, nc))
                    
        def angle(v1, v2):
            v1, v2 = np.array(v1), np.array(v2)
            cos = np.dot(v1, v2) / (np.linalg.norm(v1)*np.linalg.norm(v2) + 1e-6)
            return np.arccos(np.clip(cos, -1, 1))

        visited, robot_paths = set(), []
        for component in nx.connected_components(G):
            sub = G.subgraph(component)
            endpoints = [n for n, d in sub.degree() if d == 1]
            start_points = endpoints if endpoints else list(sub.nodes())
            for start in start_points:
                if start in visited: continue
                stroke, prev, curr = [start], None, start
                visited.add(start)
                while True:
                    nbrs = [n for n in sub.neighbors(curr) if n not in visited]
                    if not nbrs: break
                    if prev is None: nxt = nbrs[0]
                    else:
                        v_prev = (curr[0]-prev[0], curr[1]-prev[1])
                        nxt = min(nbrs, key=lambda n: angle(v_prev, (n[0]-curr[0], n[1]-curr[1])))
                    stroke.append(nxt)
                    visited.add(nxt)
                    prev, curr = curr, nxt
                if len(stroke) > 0:
                    mm_path = [((col - FIXED_IMG_SIZE // 2) * FIXED_SCALE, 
                                (FIXED_IMG_SIZE // 2 - row) * FIXED_SCALE) for row, col in stroke]
                    robot_paths.append(mm_path)

            # 시각화 결과 출력
            vis = cv2.cvtColor(img if len(img.shape)==2 else gray, cv2.COLOR_GRAY2BGR)
            for path in robot_paths:
                for i in range(len(path)-1):
                    x1, y1 = path[i]; x2, y2 = path[i+1]
                    px1 = int(x1 / FIXED_SCALE + FIXED_IMG_SIZE//2)
                    py1 = int(FIXED_IMG_SIZE//2 - y1 / FIXED_SCALE)
                    px2 = int(x2 / FIXED_SCALE + FIXED_IMG_SIZE//2)
                    py2 = int(FIXED_IMG_SIZE//2 - y2 / FIXED_SCALE)
                    cv2.line(vis, (px1, py1), (px2, py2), (0,0,255), 1)
            cv2.imshow("vis", (vis*255).astype(np.uint8))
            cv2.waitKey(30)
        return robot_paths

#-------------------------------------------------------------------------------
# 함수: main
# 기능: ROS2 런타임 초기화, 로봇 모델 설정, 실행기(Executor) 구동
#-------------------------------------------------------------------------------
def main(args=None):
    ROBOT_ID, ROBOT_MODEL = "dsr01", "m0609"
    DR_init.__dsr__id, DR_init.__dsr__model = ROBOT_ID, ROBOT_MODEL
    rclpy.init(args=args)
    node = IntegratedCakeNode(robot_id=ROBOT_ID)
    DR_init.__dsr__node = node 
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    global movel, movej, posj, posx, wait, set_robot_mode, set_digital_output
    from DSR_ROBOT2 import movel, movej, posj, posx, wait, set_robot_mode, set_digital_output
    try:
        executor.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()

if __name__ == '__main__':
    main()